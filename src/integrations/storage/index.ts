import { env } from '../../config/env.js';
import { IStorageService } from './storage.interface.js';
import { LocalStorageService } from './local.storage.js';
import { CloudinaryStorageService } from './cloudinary.storage.js';

let storageInstance: IStorageService;

if (env.CLOUDINARY_URL) {
  storageInstance = new CloudinaryStorageService();
} else {
  storageInstance = new LocalStorageService();
}

export const storageService = storageInstance;
export * from './storage.interface.js';
