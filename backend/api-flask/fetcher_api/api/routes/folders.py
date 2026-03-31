# fetcher_api/api/routes/folders.py

import logging
import time
from flask import Blueprint, request, jsonify
from fetcher_api.api.helpers.auth import get_user_id_from_request
from fetcher_api.adapters.db import execute, fetch_all, fetch_one

logger = logging.getLogger(__name__)
folders_bp = Blueprint("folders", __name__, url_prefix="/api/folders")


def _get_user_or_401():
    """Returns (user_id, None) or (None, 401 response)."""
    try:
        user_id = get_user_id_from_request()
        if not user_id:
            return None, (jsonify({"error": "Unauthorized"}), 401)
        return user_id, None
    except ValueError:
        return None, (jsonify({"error": "Unauthorized"}), 401)


def _get_all_descendant_ids(folder_id: str, user_id: str) -> list:
    """
    Recursively collect all descendant folder IDs.
    Used to prevent circular moves (can't move a folder into its own subtree).
    """
    result = []
    queue = [folder_id]
    while queue:
        current = queue.pop()
        rows = fetch_all(
            "SELECT id FROM folders WHERE parent_id = %s AND user_id = %s",
            (current, user_id)
        )
        for row in (rows or []):
            child_id = row["id"] if isinstance(row, dict) else row[0]
            result.append(child_id)
            queue.append(child_id)
    return result


def _get_all_folder_ids_in_subtree(folder_id: str, user_id: str) -> list:
    """
    Returns folder_id itself plus all descendant IDs.
    Used for cascade-delete.
    """
    descendants = _get_all_descendant_ids(folder_id, user_id)
    return [folder_id] + descendants


@folders_bp.route("", methods=["GET"])
def get_folders():
    try:
        user_id, err = _get_user_or_401()
        if err:
            return err

        rows = fetch_all(
            """
            SELECT id, name, parent_id
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
            f_id   = row["id"]        if isinstance(row, dict) else row[0]
            f_name = row["name"]      if isinstance(row, dict) else row[1]
            f_pid  = row["parent_id"] if isinstance(row, dict) else row[2]
            folders_dict[f_id] = {
                "id": f_id,
                "name": f_name,
                "parent_id": f_pid,
                "subFolders": []
            }

        root_folders = []
        for row in rows:
            f_id = row["id"]        if isinstance(row, dict) else row[0]
            p_id = row["parent_id"] if isinstance(row, dict) else row[2]
            folder = folders_dict[f_id]
            if p_id and p_id in folders_dict:
                folders_dict[p_id]["subFolders"].append(folder)
            else:
                root_folders.append(folder)

        return jsonify({"folders": root_folders}), 200

    except Exception as e:
        logger.error(f"CRASH in get_folders: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@folders_bp.route("", methods=["POST"])
def create_folder():
    try:
        user_id, err = _get_user_or_401()
        if err:
            return err

        data = request.get_json(silent=True) or {}
        name      = (data.get("name") or "").strip()
        parent_id = data.get("parent_id")

        if not name:
            return jsonify({"error": "Folder name is required"}), 400

        if parent_id:
            parent = fetch_one(
                "SELECT id FROM folders WHERE id = %s AND user_id = %s LIMIT 1",
                (parent_id, user_id)
            )
            if not parent:
                return jsonify({"error": "Parent folder not found"}), 400

        # Duplicate name check within the same scope
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
            return jsonify({"error": f"A collection named '{name}' already exists."}), 400

        folder_id = f"fld_{int(time.time() * 1000)}"
        execute(
            "INSERT INTO folders (id, user_id, name, parent_id) VALUES (%s, %s, %s, %s)",
            (folder_id, user_id, name, parent_id),
            commit=True
        )

        return jsonify({"id": folder_id, "name": name, "parent_id": parent_id, "subFolders": []}), 201

    except Exception as e:
        logger.error(f"Failed to create folder: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@folders_bp.route("/<folder_id>", methods=["PUT"])
def update_folder(folder_id):
    """
    Update a folder's name and/or parent_id (move).
    - parent_id = None  → promote to root
    - parent_id = <id>  → nest under that folder
    - parent_id key absent from body → leave parent unchanged
    """
    try:
        user_id, err = _get_user_or_401()
        if err:
            return err

        data = request.get_json(silent=True) or {}
        name = (data.get("name") or "").strip()

        # parent_id: only process if the key is explicitly present in the payload
        move_requested   = "parent_id" in data
        new_parent_id    = data.get("parent_id")   # None = root, str = nest under

        if not name:
            return jsonify({"error": "Name cannot be empty"}), 400

        # Fetch current folder
        current = fetch_one(
            "SELECT id, parent_id FROM folders WHERE id = %s AND user_id = %s LIMIT 1",
            (folder_id, user_id)
        )
        if not current:
            return jsonify({"error": "Folder not found"}), 404

        current_parent_id = current["parent_id"] if isinstance(current, dict) else current[1]

        # ── Validate move ────────────────────────────────────────────────
        if move_requested and new_parent_id != current_parent_id:

            # Can't move into itself
            if new_parent_id == folder_id:
                return jsonify({"error": "Cannot move a folder into itself"}), 400

            # Can't move into a descendant (circular)
            if new_parent_id is not None:
                descendant_ids = _get_all_descendant_ids(folder_id, user_id)
                if new_parent_id in descendant_ids:
                    return jsonify({"error": "Cannot move a folder into its own sub-collection"}), 400

                # Verify target folder exists and belongs to this user
                target = fetch_one(
                    "SELECT id FROM folders WHERE id = %s AND user_id = %s LIMIT 1",
                    (new_parent_id, user_id)
                )
                if not target:
                    return jsonify({"error": "Target folder not found"}), 404

        # ── Duplicate name check in the new scope ────────────────────────
        effective_parent = new_parent_id if move_requested else current_parent_id

        if effective_parent:
            dup = fetch_one(
                """
                SELECT id FROM folders
                WHERE user_id = %s AND LOWER(name) = LOWER(%s)
                  AND parent_id = %s AND id != %s
                LIMIT 1
                """,
                (user_id, name, effective_parent, folder_id)
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
            return jsonify({"error": f"A collection named '{name}' already exists here."}), 400

        # ── Apply updates ────────────────────────────────────────────────
        if move_requested:
            execute(
                "UPDATE folders SET name = %s, parent_id = %s WHERE id = %s AND user_id = %s",
                (name, new_parent_id, folder_id, user_id),
                commit=True
            )
        else:
            execute(
                "UPDATE folders SET name = %s WHERE id = %s AND user_id = %s",
                (name, folder_id, user_id),
                commit=True
            )

        return jsonify({"ok": True, "parent_id": new_parent_id if move_requested else current_parent_id}), 200

    except Exception as e:
        logger.error(f"Failed to update folder: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@folders_bp.route("/<folder_id>", methods=["DELETE"])
def delete_folder(folder_id):
    """
    Delete a folder and all its sub-collections recursively.
    All videos in the entire subtree are moved back to 'unsorted'.
    Sub-folders are deleted bottom-up to respect FK constraints.
    """
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

        # Collect entire subtree (self + all descendants)
        all_ids = _get_all_folder_ids_in_subtree(folder_id, user_id)

        # Move all videos in the subtree back to unsorted
        for fid in all_ids:
            execute(
                "UPDATE reels SET folder_id = 'unsorted' WHERE folder_id = %s AND user_id = %s",
                (fid, user_id),
                commit=True
            )

        # Delete folders bottom-up (deepest descendants first) to avoid FK issues
        for fid in reversed(all_ids):
            execute(
                "DELETE FROM folders WHERE id = %s AND user_id = %s",
                (fid, user_id),
                commit=True
            )

        return jsonify({"ok": True, "deleted": all_ids}), 200

    except Exception as e:
        logger.error(f"Failed to delete folder: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
