import crypto from 'crypto';
import { IStorageService, UploadResult } from './storage.interface.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

export class CloudinaryStorageService implements IStorageService {
  private getCredentials() {
    const cloudinaryUrl = process.env.CLOUDINARY_URL || env.CLOUDINARY_URL;
    if (!cloudinaryUrl) return null;
    try {
      const parsed = new URL(cloudinaryUrl);
      return {
        apiKey: parsed.username,
        apiSecret: parsed.password,
        cloudName: parsed.hostname,
      };
    } catch (err) {
      logger.warn({ err }, 'Failed to parse CLOUDINARY_URL');
      return null;
    }
  }

  async uploadImage(
    fileBuffer: Buffer,
    folder: string,
    filename?: string
  ): Promise<UploadResult> {
    const creds = this.getCredentials();
    if (!creds || !creds.cloudName || !creds.apiKey || !creds.apiSecret) {
      throw new Error(
        'Cloudinary credentials are not configured. Please set CLOUDINARY_URL environment variable.'
      );
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = filename ? `${folder}/${filename}` : `${folder}/${crypto.randomUUID()}`;

    // Cloudinary signature generation (alphabetical parameter ordering: folder, public_id, timestamp)
    const signString = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${creds.apiSecret}`;
    const signature = crypto.createHash('sha1').update(signString).digest('hex');

    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: 'image/webp' });
    formData.append('file', blob);
    formData.append('api_key', creds.apiKey);
    formData.append('timestamp', timestamp.toString());
    formData.append('signature', signature);
    formData.append('folder', folder);
    formData.append('public_id', publicId);

    const uploadUrl = `https://api.cloudinary.com/v1_1/${creds.cloudName}/image/upload`;
    const res = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error({ status: res.status, errText }, 'Cloudinary upload error');
      throw new Error(`Cloudinary upload failed: ${res.statusText}`);
    }

    const json = (await res.json()) as { secure_url: string; public_id: string };
    return {
      url: json.secure_url,
      publicId: json.public_id,
    };
  }

  async deleteImage(publicId: string): Promise<void> {
    const creds = this.getCredentials();
    if (!creds || !creds.cloudName || !creds.apiKey || !creds.apiSecret) {
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const signString = `public_id=${publicId}&timestamp=${timestamp}${creds.apiSecret}`;
    const signature = crypto.createHash('sha1').update(signString).digest('hex');

    const formData = new FormData();
    formData.append('public_id', publicId);
    formData.append('api_key', creds.apiKey);
    formData.append('timestamp', timestamp.toString());
    formData.append('signature', signature);

    const destroyUrl = `https://api.cloudinary.com/v1_1/${creds.cloudName}/image/destroy`;
    await fetch(destroyUrl, {
      method: 'POST',
      body: formData,
    });
  }
}
