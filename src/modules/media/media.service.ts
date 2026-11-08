import crypto from 'crypto';
import { prisma } from '../../db/prisma.js';
import { storageService } from '../../integrations/storage/index.js';
import { AppError } from '../../lib/errors.js';
import { APP_CONSTANTS } from '../../config/constants.js';

export class MediaService {
  /**
   * Verifies magic bytes / file signature to prevent arbitrary file upload vulnerabilities
   */
  static isValidImageSignature(buffer: Buffer): boolean {
    if (buffer.length < 12) return false;

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return true;
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return true;
    }

    // WebP: RIFF ... WEBP
    const riff = buffer.toString('ascii', 0, 4);
    const webp = buffer.toString('ascii', 8, 12);
    if (riff === 'RIFF' && webp === 'WEBP') {
      return true;
    }

    return false;
  }

  static async uploadTempleImage(
    templeId: string,
    fileBuffer: Buffer,
    userId: string
  ) {
    // 1. Size check
    if (fileBuffer.length > APP_CONSTANTS.MEDIA.MAX_IMAGE_SIZE_BYTES) {
      throw AppError.badRequest('Image file size exceeds the 5MB limit');
    }

    // 2. Magic bytes verification (Section 12: type checked by file signature)
    if (!this.isValidImageSignature(fileBuffer)) {
      throw AppError.badRequest(
        'Invalid image file type. Only genuine JPEG, PNG, or WebP images are allowed.'
      );
    }

    // 3. Determine extension based on image magic bytes
    let ext = 'jpg';
    if (fileBuffer[0] === 0x89 && fileBuffer[1] === 0x50) {
      ext = 'png';
    } else if (fileBuffer.toString('ascii', 8, 12) === 'WEBP') {
      ext = 'webp';
    }

    const filename = `${crypto.randomUUID()}.${ext}`;
    const folder = `temples/${templeId}`;

    // 4. Upload to storage provider (Cloudinary or local fallback)
    const { url, publicId } = await storageService.uploadImage(
      fileBuffer,
      folder,
      filename
    );

    // 5. Store record in media_assets
    const asset = await prisma.mediaAsset.create({
      data: {
        templeId,
        publicId,
        url,
        uploadedById: userId,
      },
    });

    return asset;
  }

  static async listTempleMedia(templeId: string) {
    return await prisma.mediaAsset.findMany({
      where: { templeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async deleteTempleMedia(templeId: string, mediaId: string) {
    const asset = await prisma.mediaAsset.findFirst({
      where: { id: mediaId, templeId },
    });

    if (!asset) {
      throw AppError.notFound('Media asset not found');
    }

    // Delete from storage
    await storageService.deleteImage(asset.publicId);

    // Delete record from DB
    await prisma.mediaAsset.delete({
      where: { id: mediaId },
    });

    return { message: 'Image deleted successfully' };
  }
}
