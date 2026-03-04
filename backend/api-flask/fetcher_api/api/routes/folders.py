import logging
import time
from flask import Blueprint, request, jsonify
from fetcher_api.api.helpers.auth import get_user_id_from_request
from fetcher_api.adapters.db import execute, fetch_all

logger = logging.getLogger(__name__)

# Note: url_prefix is /api/folders
folders_bp = Blueprint("folders", __name__, url_prefix="/api/folders")

@folders_bp.route("", methods=["GET", "OPTIONS"])
def get_folders():
    if request.method == "OPTIONS": return "", 200
    try:
        user_id = get_user_id_from_request()
        if not user_id:
            return jsonify({"error": "Unauthorized"}), 401

        # Fetch all folders for this user
        rows = fetch_all(
            "SELECT id, name, parent_id FROM folders WHERE user_id = %s ORDER BY created_at ASC", 
            (user_id,)
        )
        
        # Build the folder tree structure for the React UI
        folders_dict = {row['id']: {"id": row['id'], "name": row['name'], "subFolders": []} for row in rows}
        root_folders = []
        
        for row in rows:
            folder = folders_dict[row['id']]
            p_id = row['parent_id']
            if p_id and p_id in folders_dict:
                folders_dict[p_id]['subFolders'].append(folder)
            else:
                root_folders.append(folder)
                
        return jsonify({"folders": root_folders}), 200
    except Exception as e:
        logger.error(f"Failed to fetch folders: {e}")
        return jsonify({"error": str(e)}), 500

@folders_bp.route("", methods=["POST", "OPTIONS"])
def create_folder():
    if request.method == "OPTIONS": return "", 200
    try:
        user_id = get_user_id_from_request()
        data = request.get_json() or {}
        name = data.get("name")
        parent_id = data.get("parent_id")
        
        if not name: 
            return jsonify({"error": "Folder name is required"}), 400
        
        # Create a unique ID
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

@folders_bp.route("/<folder_id>", methods=["PUT", "OPTIONS"])
def update_folder(folder_id):
    if request.method == "OPTIONS": return "", 200
    try:
        user_id = get_user_id_from_request()
        name = (request.get_json() or {}).get("name")
        
        execute(
            "UPDATE folders SET name = %s WHERE id = %s AND user_id = %s", 
            (name, folder_id, user_id), 
            commit=True
        )
        return jsonify({"ok": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@folders_bp.route("/<folder_id>", methods=["DELETE", "OPTIONS"])
def delete_folder(folder_id):
    if request.method == "OPTIONS": return "", 200
    try:
        user_id = get_user_id_from_request()
        
        # 1. Reset any reels that were in this folder to 'default'
        execute(
            "UPDATE reels SET folder_id = 'default' WHERE folder_id = %s AND user_id = %s", 
            (folder_id, user_id), 
            commit=True
        )
        
        # 2. Delete the folder itself
        execute(
            "DELETE FROM folders WHERE id = %s AND user_id = %s", 
            (folder_id, user_id), 
            commit=True
        )
        
        return jsonify({"ok": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
