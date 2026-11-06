import { Request, Response } from 'express';
import { TemplesService } from './temples.service.js';
import { getParam } from '../../lib/params.js';

export class TemplesController {
  static async listTemples(req: Request, res: Response) {
    const result = await TemplesService.listTemples(req.query);
    res.status(200).json(result);
  }

  static async getTemple(req: Request, res: Response) {
    const temple = await TemplesService.getTempleByIdOrSlug(getParam(req, 'idOrSlug'));
    res.status(200).json({ data: temple });
  }

  static async getAdminTemple(req: Request, res: Response) {
    const temple = await TemplesService.getTempleByIdOrSlug(getParam(req, 'templeId'));
    res.status(200).json({ data: temple });
  }

  static async updateTemple(req: Request, res: Response) {
    const updated = await TemplesService.updateTemple(
      getParam(req, 'templeId'),
      req.body,
      req.user?.id,
      req.ip
    );
    res.status(200).json({ data: updated });
  }

  static async search(req: Request, res: Response) {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const limit = Number(req.query.limit) || 10;
    const results = await TemplesService.search(q, limit);
    res.status(200).json({ data: results });
  }
}
