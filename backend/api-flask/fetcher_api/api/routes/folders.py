import logging
import time
from flask import Blueprint, request, jsonify
from fetcher_api.api.helpers.auth import get_user_id_from_request
from fetcher_api.adapters.db import execute, fetch_all

logger = logging.getLogger(__name__)
folders_bp = Blueprint("folders", __name__, url_prefix="/api/folders")

@folders_bp.route("", methods=["GET"])
def get_folders():
    try:
        user_id = get_user_id_from_request()
        if not user_id:
            return jsonify({"error": "Unauthorized"}), 401

        rows = fetch_all(
            "SELECT id, name, parent_id FROM folders WHERE user_id = %s ORDER BY created_at ASC", 
            (user_id,)
        )

        if not rows:
            return jsonify({"folders": []}), 200

        folders_dict = {}
        for row in rows:
            f_id = row['id'] if isinstance(row, dict) else row[0]
            f_name = row['name'] if isinstance(row, dict) else row[1]
            folders_dict[f_id] = {"id": f_id, "name": f_name, "subFolders": []}

        root_folders = []
        for row in rows:
            f_id = row['id'] if isinstance(row, dict) else row[0]
            p_id = row['parent_id'] if isinstance(row, dict) else row[2]
            
            folder = folders_dict[f_id]
            if p_id and p_id in folders_dict:
                folders_dict[p_id]['subFolders'].append(folder)
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
        data = request.get_json() or {}
        name = data.get("name", "").strip()
        parent_id = data.get("parent_id") 
        
        if not name: 
            return jsonify({"error": "Folder name is required"}), 400
        
        # ✅ CASE INSENSITIVE DUPLICATE CHECK
        if parent_id:
            existing = fetch_all(
                "SELECT id FROM folders WHERE user_id = %s AND LOWER(name) = LOWER(%s) AND parent_id = %s",
                (user_id, name, parent_id)
            )
        else:
            existing = fetch_all(
                "SELECT id FROM folders WHERE user_id = %s AND LOWER(name) = LOWER(%s) AND parent_id IS NULL",
                (user_id, name)
            )

        if existing:
            return jsonify({"error": f"Un dossier '{name}' existe déjà."}), 400
        
        folder_id = f"fld_{int(time.time() * 1000)}" 
        
        execute(
            "INSERT INTO folders (id, user_id, name, parent_id) VALUES (%s, %s, %s, %s)", 
            (folder_id, user_id, name, parent_id), 
            commit=True
        )
                
        return jsonify({"id": folder_id, "name": name, "subFolders": []}), 201
    except Exception as e:
        logger.error(f"Failed to create folder: {e}")
        return jsonify({"error": str(e)}), 500

@folders_bp.route("/<folder_id>", methods=["PUT"])
def update_folder(folder_id):
    try:
        user_id = get_user_id_from_request()
        name = (request.get_json() or {}).get("name", "").strip()
        
        if not name:
            return jsonify({"error": "Name cannot be empty"}), 400

        current = fetch_all("SELECT parent_id FROM folders WHERE id = %s AND user_id = %s", (folder_id, user_id))
        if not current: 
            return jsonify({"error": "Folder not found"}), 404
        
        parent_id = current[0]['parent_id'] if isinstance(current[0], dict) else current[0][0]

        # ✅ CASE INSENSITIVE DUPLICATE CHECK
        if parent_id:
            dup = fetch_all(
                "SELECT id FROM folders WHERE user_id = %s AND LOWER(name) = LOWER(%s) AND parent_id = %s AND id != %s", 
                (user_id, name, parent_id, folder_id)
            )
        else:
            dup = fetch_all(
                "SELECT id FROM folders WHERE user_id = %s AND LOWER(name) = LOWER(%s) AND parent_id IS NULL AND id != %s", 
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
        logger.error(f"Failed to update folder: {e}")
        return jsonify({"error": str(e)}), 500

@folders_bp.route("/<folder_id>", methods=["DELETE"])
def delete_folder(folder_id):
    try:
        user_id = get_user_id_from_request()
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
        logger.error(f"Failed to delete folder: {e}")
        return jsonify({"error": str(e)}), 500
