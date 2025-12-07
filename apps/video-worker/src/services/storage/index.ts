import { getEnv } from '@/config';
import { logger } from '@/plugins/logger';
import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import fs from 'fs';
import path from 'path';

let containerClient: ContainerClient | null = null;

export async function initializeStorage(): Promise<ContainerClient> {
  if (containerClient) {
    return containerClient;
  }

  const env = getEnv();

  const blobServiceClient = BlobServiceClient.fromConnectionString(env.AZURE_STORAGE_CONNECTION_STRING);

  containerClient = blobServiceClient.getContainerClient(env.AZURE_STORAGE_CONTAINER_NAME);

  // Create container if it doesn't exist
  const exists = await containerClient.exists();
  if (!exists) {
    await containerClient.create();
    logger.info(`Created blob container: ${env.AZURE_STORAGE_CONTAINER_NAME}`);
  }

  logger.info('Azure Blob Storage initialized');

  return containerClient;
}

export function getContainerClient(): ContainerClient {
  if (!containerClient) {
    throw new Error('Storage not initialized. Call initializeStorage() first.');
  }
  return containerClient;
}

/**
 * Extract blob name from a full URL or return as-is if already a blob name
 */
function extractBlobName(urlOrBlobName: string): string {
  // If it looks like a full URL, extract the blob name
  if (urlOrBlobName.startsWith('http://') || urlOrBlobName.startsWith('https://')) {
    try {
      const url = new URL(urlOrBlobName);
      // Remove the leading slash and container name from the pathname
      // URL format: https://<account>.blob.core.windows.net/<container>/<blob-name>
      const pathParts = url.pathname.split('/').filter(Boolean);
      // Skip the container name (first part) and join the rest
      if (pathParts.length > 1) {
        return pathParts.slice(1).join('/');
      }
      return pathParts[0] || urlOrBlobName;
    } catch {
      return urlOrBlobName;
    }
  }
  return urlOrBlobName;
}

// Storage utility functions
export const storage = {
  /**
   * Download a blob to a local file
   * Accepts either a blob name or full URL
   */
  async downloadToFile(blobNameOrUrl: string, localFilePath: string): Promise<void> {
    const client = getContainerClient();
    const blobName = extractBlobName(blobNameOrUrl);
    const blobClient = client.getBlobClient(blobName);

    // Ensure directory exists
    const dir = path.dirname(localFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await blobClient.downloadToFile(localFilePath);
    logger.debug(`Downloaded blob: ${blobName} to ${localFilePath}`);
  },

  /**
   * Upload a local file to blob storage
   */
  async uploadFromFile(localFilePath: string, blobName: string, contentType?: string): Promise<string> {
    const client = getContainerClient();
    const blockBlobClient = client.getBlockBlobClient(blobName);

    await blockBlobClient.uploadFile(localFilePath, {
      blobHTTPHeaders: {
        blobContentType: contentType || 'application/octet-stream',
      },
    });

    logger.debug(`Uploaded file: ${localFilePath} to blob: ${blobName}`);

    return blockBlobClient.url;
  },

  /**
   * Upload buffer to blob storage
   */
  async uploadBuffer(buffer: Buffer, blobName: string, contentType?: string): Promise<string> {
    const client = getContainerClient();
    const blockBlobClient = client.getBlockBlobClient(blobName);

    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: {
        blobContentType: contentType || 'application/octet-stream',
      },
    });

    logger.debug(`Uploaded buffer to blob: ${blobName}`);

    return blockBlobClient.url;
  },

  /**
   * Delete a blob
   */
  async delete(blobName: string): Promise<void> {
    const client = getContainerClient();
    const blobClient = client.getBlobClient(blobName);

    await blobClient.deleteIfExists();
    logger.debug(`Deleted blob: ${blobName}`);
  },

  /**
   * Check if a blob exists
   */
  async exists(blobName: string): Promise<boolean> {
    const client = getContainerClient();
    const blobClient = client.getBlobClient(blobName);
    return await blobClient.exists();
  },

  /**
   * Get blob URL with SAS token for temporary access
   */
  getBlobUrl(blobName: string): string {
    const client = getContainerClient();
    const blobClient = client.getBlobClient(blobName);
    return blobClient.url;
  },

  /**
   * List blobs with a prefix
   */
  async listBlobs(prefix: string): Promise<string[]> {
    const client = getContainerClient();
    const blobs: string[] = [];

    for await (const blob of client.listBlobsFlat({ prefix })) {
      blobs.push(blob.name);
    }

    return blobs;
  },
};

export default storage;
