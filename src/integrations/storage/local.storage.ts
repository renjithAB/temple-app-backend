import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { IStorageService, UploadResult } from './storage.interface.js';
import { logger } from '../../lib/logger.js';

export class LocalStorageService implements IStorageService {
  private baseDir: string;

  constructor(baseDir = 'uploads') {
    this.baseDir = path.resolve(process.cwd(), baseDir);
  }

  async uploadImage(
    fileBuffer: Buffer,
    folder: string,
    filename?: string
  ): Promise<UploadResult> {
    const targetFolder = path.join(this.baseDir, folder);
    await fs.mkdir(targetFolder, { recursive: true });

    const name = filename || `${crypto.randomUUID()}.webp`;
    const filePath = path.join(targetFolder, name);
    await fs.writeFile(filePath, fileBuffer);

    const publicId = `${folder}/${name}`;
    const url = `/uploads/${folder}/${name}`;

    logger.debug({ publicId, url }, 'Image stored locally');
    return { url, publicId };
  }

  async deleteImage(publicId: string): Promise<void> {
    try {
      const filePath = path.join(this.baseDir, publicId);
      await fs.unlink(filePath);
      logger.debug({ publicId }, 'Local image deleted');
    } catch {
      // Ignore if already deleted
    }
  }
}
