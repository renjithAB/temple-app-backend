import { Request, Response } from 'express';
import { OccasionsService } from './occasions.service.js';
import { getParam } from '../../lib/params.js';

export class OccasionsController {
  static async listPlatformOccasions(req: Request, res: Response) {
    const fromStr = typeof req.query.from === 'string' ? req.query.from : undefined;
    const toStr = typeof req.query.to === 'string' ? req.query.to : undefined;
    const occasions = await OccasionsService.listPlatformOccasions(fromStr, toStr);
    res.status(200).json({ data: occasions });
  }

  static async listTempleOccasions(req: Request, res: Response) {
    const fromStr = typeof req.query.from === 'string' ? req.query.from : undefined;
    const toStr = typeof req.query.to === 'string' ? req.query.to : undefined;
    const occasions = await OccasionsService.listTempleOccasions(
      getParam(req, 'id'),
      fromStr,
      toStr
    );
    res.status(200).json({ data: occasions });
  }

  static async listAdminOccasions(req: Request, res: Response) {
    const occasions = await OccasionsService.listAdminOccasions(getParam(req, 'templeId'));
    res.status(200).json({ data: occasions });
  }

  static async createOccasion(req: Request, res: Response) {
    const created = await OccasionsService.createOccasion(
      getParam(req, 'templeId'),
      req.body,
      req.user?.id,
      req.ip
    );
    res.status(201).json({ data: created });
  }

  static async updateOccasion(req: Request, res: Response) {
    const updated = await OccasionsService.updateOccasion(
      getParam(req, 'templeId'),
      getParam(req, 'id'),
      req.body,
      req.user?.id,
      req.ip
    );
    res.status(200).json({ data: updated });
  }

  static async deleteOccasion(req: Request, res: Response) {
    const result = await OccasionsService.deleteOccasion(
      getParam(req, 'templeId'),
      getParam(req, 'id'),
      req.user?.id,
      req.ip
    );
    res.status(200).json({ data: result });
  }
}
