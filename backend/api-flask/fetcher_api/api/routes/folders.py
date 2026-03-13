import logging
from flask import Blueprint, jsonify, request

from fetcherapi.adapters.db import execute, fetchall, fetchone
from fetcherapi.api.helpers.auth import getuseridfromrequest

logger = logging.getLogger(__name__)

foldersbp = Blueprint("folders", __name__)


@foldersbp.route("/api/folders", methods=["GET"])
def getfolders():
    try:
        userid = getuseridfromrequest()

        rows = fetchall(
            """
            SELECT id, name, parent_id
            FROM folders
            WHERE user_id = %s
            ORDER BY
                CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END,
                name ASC
            """,
            (userid,),
        )

        return jsonify(rows), 200
    except ValueError as e:
        logger.warning("getfolders unauthenticated: %s", e)
        return jsonify({"error": "Authentication required"}), 401
    except Exception as e:
        logger.exception("CRASH in getfolders")
        return jsonify({"error": str(e)}), 500


@foldersbp.route("/api/folders", methods=["POST"])
def createfolder():
    try:
        userid = getuseridfromrequest()
        data = request.get_json(silent=True) or {}

        folder_id = data.get("id")
        name = (data.get("name") or "").strip()
        parent_id = data.get("parentId")

        if not folder_id or not name:
            return jsonify({"error": "id and name are required"}), 400

        if parent_id:
            parent = fetchone(
                """
                SELECT id
                FROM folders
                WHERE id = %s AND user_id = %s
                LIMIT 1
                """,
                (parent_id, userid),
            )
            if not parent:
                return jsonify({"error": "Parent folder not found"}), 400

        execute(
            """
            INSERT INTO folders (id, user_id, name, parent_id)
            VALUES (%s, %s, %s, %s)
            """,
            (folder_id, userid, name, parent_id),
            commit=True,
        )

        row = fetchone(
            """
            SELECT id, name, parent_id
            FROM folders
            WHERE id = %s AND user_id = %s
            LIMIT 1
            """,
            (folder_id, userid),
        )

        return jsonify(row), 201
    except ValueError as e:
        logger.warning("createfolder unauthenticated: %s", e)
        return jsonify({"error": "Authentication required"}), 401
    except Exception as e:
        logger.exception("CRASH in createfolder")
        return jsonify({"error": str(e)}), 500


@foldersbp.route("/api/folders/<folder_id>", methods=["PUT"])
def updatefolder(folder_id):
    try:
        userid = getuseridfromrequest()
        data = request.get_json(silent=True) or {}

        name = (data.get("name") or "").strip()
        parent_id = data.get("parentId")

        if not name:
            return jsonify({"error": "name is required"}), 400

        existing = fetchone(
            """
            SELECT id, parent_id
            FROM folders
            WHERE id = %s AND user_id = %s
            LIMIT 1
            """,
            (folder_id, userid),
        )
        if not existing:
            return jsonify({"error": "Folder not found"}), 404

        if parent_id == folder_id:
            return jsonify({"error": "Folder cannot be its own parent"}), 400

        if parent_id:
            parent = fetchone(
                """
                SELECT id
                FROM folders
                WHERE id = %s AND user_id = %s
                LIMIT 1
                """,
                (parent_id, userid),
            )
            if not parent:
                return jsonify({"error": "Parent folder not found"}), 400

        execute(
            """
            UPDATE folders
            SET name = %s,
                parent_id = %s
            WHERE id = %s AND user_id = %s
            """,
            (name, parent_id, folder_id, userid),
            commit=True,
        )

        row = fetchone(
            """
            SELECT id, name, parent_id
            FROM folders
            WHERE id = %s AND user_id = %s
            LIMIT 1
            """,
            (folder_id, userid),
        )

        return jsonify(row), 200
    except ValueError as e:
        logger.warning("updatefolder unauthenticated: %s", e)
        return jsonify({"error": "Authentication required"}), 401
    except Exception as e:
        logger.exception("CRASH in updatefolder")
        return jsonify({"error": str(e)}), 500


@foldersbp.route("/api/folders/<folder_id>", methods=["DELETE"])
def deletefolder(folder_id):
    try:
        userid = getuseridfromrequest()

        existing = fetchone(
            """
            SELECT id
            FROM folders
            WHERE id = %s AND user_id = %s
            LIMIT 1
            """,
            (folder_id, userid),
        )
        if not existing:
            return jsonify({"error": "Folder not found"}), 404

        child = fetchone(
            """
            SELECT id
            FROM folders
            WHERE parent_id = %s AND user_id = %s
            LIMIT 1
            """,
            (folder_id, userid),
        )
        if child:
            return jsonify({"error": "Cannot delete folder with children"}), 400

        execute(
            """
            UPDATE reels
            SET folderid = 'default'
            WHERE folderid = %s AND userid = %s
            """,
            (folder_id, userid),
            commit=True,
        )

        execute(
            """
            DELETE FROM folders
            WHERE id = %s AND user_id = %s
            """,
            (folder_id, userid),
            commit=True,
        )

        return jsonify({"status": "deleted", "id": folder_id}), 200
    except ValueError as e:
        logger.warning("deletefolder unauthenticated: %s", e)
        return jsonify({"error": "Authentication required"}), 401
    except Exception as e:
        logger.exception("CRASH in deletefolder")
        return jsonify({"error": str(e)}), 500
