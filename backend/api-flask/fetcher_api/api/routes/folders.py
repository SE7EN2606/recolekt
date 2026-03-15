# fetcher_api/api/routes/folders.py

import logging
import time
from flask import Blueprint, request, jsonify
from fetcher_api.api.helpers.auth import get_user_id_from_request
from fetcher_api.adapters.db import execute, fetch_all, fetch_one

logger = logging.getLogger(__name__)
folders_bp = Blueprint("folders", __name__, url_prefix="/api/folders")


@folders_bp.route("", methods=["GET"])
def get_folders():
    try:
        user_id = get_user_id_from_request()
        if not user_id:
            return jsonify({"error": "Unauthorized"}), 401

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
            f_id = row["id"] if isinstance(row, dict) else row[0]
            f_name = row["name"] if isinstance(row, dict) else row[1]
            folders_dict[f_id] = {
                "id": f_id,
                "name": f_name,
                "subFolders": []
            }

        root_folders = []
        for row in rows:
            f_id = row["id"] if isinstance(row, dict) else row[0]
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
        user_id = get_user_id_from_request()
        if not user_id:
            return jsonify({"error": "Unauthorized"}), 401

        data = request.get_json(silent=True) or {}
        name = (data.get("name") or "").strip()
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

        if parent_id:
            existing = fetch_one(
                """
                SELECT id
                FROM folders
                WHERE user_id = %s
                  AND LOWER(name) = LOWER(%s)
                  AND parent_id = %s
                LIMIT 1
                """,
                (user_id, name, parent_id)
            )
        else:
            existing = fetch_one(
                """
                SELECT id
                FROM folders
                WHERE user_id = %s
                  AND LOWER(name) = LOWER(%s)
                  AND parent_id IS NULL
                LIMIT 1
                """,
                (user_id, name)
            )

        if existing:
            return jsonify({"error": f"Un dossier '{name}' existe déjà."}), 400

        folder_id = f"fld_{int(time.time() * 1000)}"

        execute(
            """
            INSERT INTO folders (id, user_id, name, parent_id)
            VALUES (%s, %s, %s, %s)
            """,
            (folder_id, user_id, name, parent_id),
            commit=True
        )

        return jsonify({
            "id": folder_id,
            "name": name,
            "subFolders": []
        }), 201

    except Exception as e:
        logger.error(f"Failed to create folder: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@folders_bp.route("/<folder_id>", methods=["PUT"])
def update_folder(folder_id):
    try:
        user_id = get_user_id_from_request()
        if not user_id:
            return jsonify({"error": "Unauthorized"}), 401

        data = request.get_json(silent=True) or {}
        name = (data.get("name") or "").strip()

        if not name:
            return jsonify({"error": "Name cannot be empty"}), 400

        current = fetch_one(
            "SELECT id, parent_id FROM folders WHERE id = %s AND user_id = %s LIMIT 1",
            (folder_id, user_id)
        )
        if not current:
            return jsonify({"error": "Folder not found"}), 404

        parent_id = current["parent_id"] if isinstance(current, dict) else current[1]

        if parent_id:
            dup = fetch_one(
                """
                SELECT id
                FROM folders
                WHERE user_id = %s
                  AND LOWER(name) = LOWER(%s)
                  AND parent_id = %s
                  AND id != %s
                LIMIT 1
                """,
                (user_id, name, parent_id, folder_id)
            )
        else:
            dup = fetch_one(
                """
                SELECT id
                FROM folders
                WHERE user_id = %s
                  AND LOWER(name) = LOWER(%s)
                  AND parent_id IS NULL
                  AND id != %s
                LIMIT 1
                """,
                (user_id, name, folder_id)
            )

        if dup:
            return jsonify({"error": f"Un dossier '{name}' existe déjà."}), 400

        execute(
            "UPDATE folders SET name = %s WHERE id = %s AND user_id = %s",
            (name, folder_id, user_id),
            commit=True
        )

        return jsonify({"ok": True}), 200

    except Exception as e:
        logger.error(f"Failed to update folder: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@folders_bp.route("/<folder_id>", methods=["DELETE"])
def delete_folder(folder_id):
    try:
        user_id = get_user_id_from_request()
        if not user_id:
            return jsonify({"error": "Unauthorized"}), 401

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
