# fetcher_api/api/routes/folders.py

import logging
import re
import time
from flask import Blueprint, request, jsonify
from fetcher_api.api.helpers.auth import get_user_id_from_request
from fetcher_api.adapters.db import execute, fetch_all, fetch_one


logger = logging.getLogger(__name__)
folders_bp = Blueprint("folders", __name__, url_prefix="/api/folders")

def normalize_folder_name(name: str) -> str:
    name = str(name or "").strip()
    name = re.sub(r"[^A-Za-z0-9À-ÖØ-öø-ÿ -]", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    name = re.sub(r"-+", "-", name).strip("- ").strip()

    if not name:
        raise ValueError("Folder name cannot be empty")

    return name[:1].upper() + name[1:]



# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _get_user_or_401():
    """Returns (user_id, None) or (None, 401 response)."""
    try:
        user_id = get_user_id_from_request()
        if not user_id:
            return None, (jsonify({"error": "Unauthorized"}), 401)
        return user_id, None
    except ValueError:
        return None, (jsonify({"error": "Unauthorized"}), 401)


def generate_slug(name: str) -> str:
    """Generate a URL-safe slug from a folder name."""
    slug = name.lower().strip()
    slug = re.sub(r'[^\w\s-]', '', slug)        # remove special chars
    slug = re.sub(r'[\s_]+', '-', slug)          # spaces/underscores → hyphens
    slug = re.sub(r'-+', '-', slug).strip('-')   # collapse + trim hyphens
    return slug or 'folder'


def _row_to_dict(row) -> dict:
    """Normalise a DB row (dict or tuple) into a consistent dict."""
    if isinstance(row, dict):
        return {
            "id":        row["id"],
            "name":      row["name"],
            "slug":      row.get("slug") or generate_slug(row["name"]),
            "parent_id": row.get("parent_id"),
        }
    # tuple fallback: id, name, slug, parent_id
    return {
        "id":        row[0],
        "name":      row[1],
        "slug":      row[2] or generate_slug(row[1]),
        "parent_id": row[3],
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/folders
# ─────────────────────────────────────────────────────────────────────────────

@folders_bp.route("", methods=["GET"])
def get_folders():
    try:
        user_id, err = _get_user_or_401()
        if err:
            return err

        rows = fetch_all(
            """
            SELECT id, name, slug, parent_id
            FROM folders
            WHERE user_id = %s
            ORDER BY
                CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END,
                name ASC
            """,
            (user_id,)
        )

        if not rows:
            return jsonify({"folders": []}), 200

        folders_dict = {}
        for row in rows:
            d = _row_to_dict(row)
            folders_dict[d["id"]] = {
                "id":         d["id"],
                "name":       d["name"],
                "slug":       d["slug"],
                "subFolders": [],
            }

        root_folders = []
        for row in rows:
            d = _row_to_dict(row)
            folder = folders_dict[d["id"]]
            p_id   = d["parent_id"]
            if p_id and p_id in folders_dict:
                folders_dict[p_id]["subFolders"].append(folder)
            else:
                root_folders.append(folder)

        return jsonify({"folders": root_folders}), 200

    except Exception as e:
        logger.error(f"CRASH in get_folders: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/folders
# ─────────────────────────────────────────────────────────────────────────────

@folders_bp.route("", methods=["POST"])
def create_folder():
    try:
        user_id, err = _get_user_or_401()
        if err:
            return err

        data      = request.get_json(silent=True) or {}
        try:
            name = normalize_folder_name(data.get("name"))
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        parent_id = data.get("parent_id")

        if parent_id:
            parent = fetch_one(
                "SELECT id FROM folders WHERE id = %s AND user_id = %s LIMIT 1",
                (parent_id, user_id)
            )
            if not parent:
                return jsonify({"error": "Parent folder not found"}), 400

        # Duplicate name check
        if parent_id:
            existing = fetch_one(
                """
                SELECT id FROM folders
                WHERE user_id = %s AND LOWER(name) = LOWER(%s) AND parent_id = %s
                LIMIT 1
                """,
                (user_id, name, parent_id)
            )
        else:
            existing = fetch_one(
                """
                SELECT id FROM folders
                WHERE user_id = %s AND LOWER(name) = LOWER(%s) AND parent_id IS NULL
                LIMIT 1
                """,
                (user_id, name)
            )

        if existing:
            return jsonify({"error": f"Un dossier '{name}' existe déjà."}), 400

        folder_id = f"fld_{int(time.time() * 1000)}"
        slug      = generate_slug(name)

        execute(
            "INSERT INTO folders (id, user_id, name, slug, parent_id) VALUES (%s, %s, %s, %s, %s)",
            (folder_id, user_id, name, slug, parent_id),
            commit=True
        )

        return jsonify({
            "id":         folder_id,
            "name":       name,
            "slug":       slug,
            "subFolders": [],
        }), 201

    except Exception as e:
        logger.error(f"Failed to create folder: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────────
# PUT /api/folders/<folder_id>  — rename and/or reparent
# ─────────────────────────────────────────────────────────────────────────────

@folders_bp.route("/<folder_id>", methods=["PUT"])
def update_folder(folder_id):
    try:
        user_id, err = _get_user_or_401()
        if err:
            return err

        data = request.get_json(silent=True) or {}
        try:
            name = normalize_folder_name(data.get("name"))
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        current = fetch_one(
            "SELECT id, parent_id FROM folders WHERE id = %s AND user_id = %s LIMIT 1",
            (folder_id, user_id)
        )
        if not current:
            return jsonify({"error": "Folder not found"}), 404

        # Support reparenting (move folder) — falls back to current parent if not sent
        if "parent_id" in data:
            # explicit key present — could be None (move to root) or a string ID
            new_parent_id = data["parent_id"]
        else:
            new_parent_id = current["parent_id"] if isinstance(current, dict) else current[1]

        # Validate new parent exists and belongs to user (skip if moving to root)
        if new_parent_id:
            parent = fetch_one(
                "SELECT id FROM folders WHERE id = %s AND user_id = %s LIMIT 1",
                (new_parent_id, user_id)
            )
            if not parent:
                return jsonify({"error": "Parent folder not found"}), 400

        # Duplicate name check in the target parent scope
        if new_parent_id:
            dup = fetch_one(
                """
                SELECT id FROM folders
                WHERE user_id = %s AND LOWER(name) = LOWER(%s)
                  AND parent_id = %s AND id != %s
                LIMIT 1
                """,
                (user_id, name, new_parent_id, folder_id)
            )
        else:
            dup = fetch_one(
                """
                SELECT id FROM folders
                WHERE user_id = %s AND LOWER(name) = LOWER(%s)
                  AND parent_id IS NULL AND id != %s
                LIMIT 1
                """,
                (user_id, name, folder_id)
            )

        if dup:
            return jsonify({"error": f"Un dossier '{name}' existe déjà."}), 400

        slug = generate_slug(name)

        execute(
            "UPDATE folders SET name = %s, slug = %s, parent_id = %s WHERE id = %s AND user_id = %s",
            (name, slug, new_parent_id, folder_id, user_id),
            commit=True
        )

        return jsonify({"ok": True, "slug": slug}), 200

    except Exception as e:
        logger.error(f"Failed to update folder: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────────
# DELETE /api/folders/<folder_id>
# ─────────────────────────────────────────────────────────────────────────────

@folders_bp.route("/<folder_id>", methods=["DELETE"])
def delete_folder(folder_id):
    try:
        user_id, err = _get_user_or_401()
        if err:
            return err

        existing = fetch_one(
            "SELECT id FROM folders WHERE id = %s AND user_id = %s LIMIT 1",
            (folder_id, user_id)
        )
        if not existing:
            return jsonify({"error": "Folder not found"}), 404

        child = fetch_one(
            "SELECT id FROM folders WHERE parent_id = %s AND user_id = %s LIMIT 1",
            (folder_id, user_id)
        )
        if child:
            return jsonify({"error": "Cannot delete folder with children"}), 400

        execute(
            "UPDATE reels SET folder_id = 'default' WHERE folder_id = %s AND user_id = %s",
            (folder_id, user_id),
            commit=True
        )
        execute(
            "DELETE FROM folders WHERE id = %s AND user_id = %s",
            (folder_id, user_id),
            commit=True
        )

        return jsonify({"ok": True}), 200

    except Exception as e:
        logger.error(f"Failed to delete folder: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500