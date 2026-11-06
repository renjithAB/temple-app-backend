import { Request, Response } from 'express';
import { MediaService } from './media.service.js';
import { AppError } from '../../lib/errors.js';
import { getParam } from '../../lib/params.js';

export class MediaController {
  static async uploadImage(req: Request, res: Response) {
    if (!req.file || !req.file.buffer) {
      throw AppError.badRequest('No image file uploaded');
    }

    const asset = await MediaService.uploadTempleImage(
      getParam(req, 'templeId'),
      req.file.buffer,
      req.user!.id
    );

    res.status(201).json({ data: asset });
  }

  static async listMedia(req: Request, res: Response) {
    const list = await MediaService.listTempleMedia(getParam(req, 'templeId'));
    res.status(200).json({ data: list });
  }

  static async deleteMedia(req: Request, res: Response) {
    const result = await MediaService.deleteTempleMedia(
      getParam(req, 'templeId'),
      getParam(req, 'id')
    );
    res.status(200).json({ data: result });
  }
}
