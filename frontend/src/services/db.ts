import { API_BASE } from "../utils/api";
import Dexie, { Table } from 'dexie';

// Interfaces
export interface Video {
  id: string;
  process_id?: string;
  source_url: string;
  summary?: {
    title?: string;
    category?: string;
    topic?: string;
    bullets?: string[];
    emojis?: string[];
    hashtags?: string[];
  };
  gcs_urls?: {
    video?: string;
    thumbnail?: string;
    preview_thumbnail?: string;
    caption_json?: string;
    transcription?: string;
    result_json?: string;
  };
  caption?: string;
  author_name?: string;
  transcription?: {
    transcript?: string;
  };
  content_type?: string;
  recipe?: any;
  created_at: string;
  folder_id?: string; // Links video to a folder
  is_favorite?: boolean;
}

export interface Folder {
  id: string;
  name: string;
  emoji?: string; // Optional emoji icon
  subFolders?: Folder[]; // Nested folders
  itemCount?: number; // Virtual count (not stored)
}

class RecolektDB extends Dexie {
  videos!: Table<Video>;
  folders!: Table<Folder>;

  constructor() {
    super('RecolektDB');
    this.version(1).stores({
      videos: 'id, folder_id, created_at, is_favorite', 
      folders: 'id, name' 
    });
  }

  // --- FOLDER OPERATIONS ---

  async addFolder(name: string, parentId?: string) {
    const newFolder: Folder = {
      id: crypto.randomUUID(),
      name,
      emoji: '📁',
      subFolders: []
    };

    if (parentId) {
      // Add as subfolder
      const parent = await this.folders.get(parentId);
      if (parent) {
        if (!parent.subFolders) parent.subFolders = [];
        parent.subFolders.push(newFolder);
        await this.folders.put(parent);
      }
    } else {
      // Add as root folder
      await this.folders.add(newFolder);
    }
    return newFolder;
  }

  async updateFolder(id: string, newName: string) {
    // 1. Try to find/update if it's a root folder
    const rootFolder = await this.folders.get(id);
    if (rootFolder) {
      await this.folders.update(id, { name: newName });
      return;
    }

    // 2. If not root, search inside all folders for the subfolder
    const allFolders = await this.folders.toArray();
    for (const folder of allFolders) {
      if (folder.subFolders && folder.subFolders.length > 0) {
        const subIndex = folder.subFolders.findIndex(s => s.id === id);
        if (subIndex !== -1) {
          // Found it! Update the name in the array
          folder.subFolders[subIndex].name = newName;
          // Save the parent folder to persist changes
          await this.folders.put(folder);
          return;
        }
      }
    }
  }

  async deleteFolder(id: string) {
    // 1. Try to delete as root folder
    const rootFolder = await this.folders.get(id);
    if (rootFolder) {
      await this.folders.delete(id);
      return;
    }

    // 2. If not root, try to remove from a parent's subFolders list
    const allFolders = await this.folders.toArray();
    for (const folder of allFolders) {
      if (folder.subFolders) {
        const initialLength = folder.subFolders.length;
        const newSubFolders = folder.subFolders.filter(s => s.id !== id);
        
        // If length changed, we found and removed the subfolder
        if (newSubFolders.length !== initialLength) {
          folder.subFolders = newSubFolders;
          await this.folders.put(folder);
          return;
        }
      }
    }
  }

  async getFolders() {
    return await this.folders.toArray();
  }
}

export const db = new RecolektDB();