/**
 * Google Drive API Connector
 * Search, upload, and share files seamlessly
 */

import { google } from "googleapis";
import type { drive_v3 } from "googleapis";
import { Readable } from "stream";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdTime: Date;
  modifiedTime: Date;
  webViewLink: string;
  owners: string[];
}

export interface UploadFileOptions {
  fileName: string;
  mimeType: string;
  fileContent: Buffer | Readable;
  parentFolderId?: string;
}

export class DriveConnector {
  private drive: drive_v3.Drive;

  constructor(auth: any) {
    this.drive = google.drive({ version: "v3", auth });
  }

  /**
   * Search files
   */
  async searchFiles(query: string, maxResults: number = 20): Promise<DriveFile[]> {
    try {
      const response = await this.drive.files.list({
        q: query,
        spaces: "drive",
        pageSize: maxResults,
        fields: "files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, owners)",
      });

      const files = response.data.files || [];

      return files.map((file) => ({
        id: file.id || "",
        name: file.name || "",
        mimeType: file.mimeType || "",
        size: file.size ? parseInt(file.size as unknown as string) : 0,
        createdTime: new Date(file.createdTime || ""),
        modifiedTime: new Date(file.modifiedTime || ""),
        webViewLink: file.webViewLink || "",
        owners: file.owners?.map((o) => o.emailAddress || "") || [],
      }));
    } catch (error) {
      throw new Error(`Drive API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Upload file
   */
  async uploadFile(options: UploadFileOptions): Promise<string> {
    try {
      const fileMetadata: drive_v3.Schema$File = {
        name: options.fileName,
        ...(options.parentFolderId && { parents: [options.parentFolderId] }),
      };

      const media = {
        mimeType: options.mimeType,
        body: options.fileContent,
      };

      const response = await this.drive.files.create({
        requestBody: fileMetadata,
        media,
        fields: "id, webViewLink",
      });

      return response.data.id || "";
    } catch (error) {
      throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete file
   */
  async deleteFile(fileId: string): Promise<void> {
    try {
      await this.drive.files.delete({
        fileId,
      });
    } catch (error) {
      throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Share file with user
   */
  async shareFile(fileId: string, email: string, role: "reader" | "writer" | "owner" = "reader"): Promise<void> {
    try {
      await this.drive.permissions.create({
        fileId,
        requestBody: {
          role,
          type: "user",
          emailAddress: email,
        },
      });
    } catch (error) {
      throw new Error(`Failed to share file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(fileId: string): Promise<DriveFile> {
    try {
      const response = await this.drive.files.get({
        fileId,
        fields: "id, name, mimeType, size, createdTime, modifiedTime, webViewLink, owners",
      });

      const file = response.data;

      return {
        id: file.id || "",
        name: file.name || "",
        mimeType: file.mimeType || "",
        size: file.size ? parseInt(file.size as unknown as string) : 0,
        createdTime: new Date(file.createdTime || ""),
        modifiedTime: new Date(file.modifiedTime || ""),
        webViewLink: file.webViewLink || "",
        owners: file.owners?.map((o) => o.emailAddress || "") || [],
      };
    } catch (error) {
      throw new Error(`Failed to get file metadata: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List files in folder
   */
  async listFilesInFolder(folderId: string, maxResults: number = 20): Promise<DriveFile[]> {
    try {
      const response = await this.drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        spaces: "drive",
        pageSize: maxResults,
        fields: "files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, owners)",
      });

      const files = response.data.files || [];

      return files.map((file) => ({
        id: file.id || "",
        name: file.name || "",
        mimeType: file.mimeType || "",
        size: file.size ? parseInt(file.size as unknown as string) : 0,
        createdTime: new Date(file.createdTime || ""),
        modifiedTime: new Date(file.modifiedTime || ""),
        webViewLink: file.webViewLink || "",
        owners: file.owners?.map((o) => o.emailAddress || "") || [],
      }));
    } catch (error) {
      throw new Error(`Failed to list files: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create folder
   */
  async createFolder(folderName: string, parentFolderId?: string): Promise<string> {
    try {
      const fileMetadata: drive_v3.Schema$File = {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        ...(parentFolderId && { parents: [parentFolderId] }),
      };

      const response = await this.drive.files.create({
        requestBody: fileMetadata,
        fields: "id",
      });

      return response.data.id || "";
    } catch (error) {
      throw new Error(`Failed to create folder: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export default DriveConnector;
