import { env } from '../../config/env.js';
import { IStorageService, UploadResult } from './storage.interface.js';
import { LocalStorageService } from './local.storage.js';
import { CloudinaryStorageService } from './cloudinary.storage.js';

class DynamicStorageService implements IStorageService {
  private localService = new LocalStorageService();
  private cloudinaryService = new CloudinaryStorageService();

  private getActiveService(): IStorageService {
    const cloudinaryUrl = process.env.CLOUDINARY_URL || env.CLOUDINARY_URL;
    if (cloudinaryUrl) {
      return this.cloudinaryService;
    }
    return this.localService;
  }

  async uploadImage(
    fileBuffer: Buffer,
    folder: string,
    filename?: string
  ): Promise<UploadResult> {
    return this.getActiveService().uploadImage(fileBuffer, folder, filename);
  }

  async deleteImage(publicId: string): Promise<void> {
    return this.getActiveService().deleteImage(publicId);
  }
}

export const storageService: IStorageService = new DynamicStorageService();
export * from './storage.interface.js';
