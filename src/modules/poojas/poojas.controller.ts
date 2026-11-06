import { Request, Response } from 'express';
import { PoojasService } from './poojas.service.js';
import { getParam } from '../../lib/params.js';

export class PoojasController {
  static async listPublicPoojas(req: Request, res: Response) {
    const poojas = await PoojasService.listPublicPoojas(getParam(req, 'id'));
    res.status(200).json({ data: poojas });
  }

  static async getAvailability(req: Request, res: Response) {
    const fromStr = typeof req.query.from === 'string' ? req.query.from : undefined;
    const toStr = typeof req.query.to === 'string' ? req.query.to : undefined;
    const result = await PoojasService.getAvailability(getParam(req, 'id'), fromStr, toStr);
    res.status(200).json({ data: result });
  }

  static async listAdminPoojas(req: Request, res: Response) {
    const poojas = await PoojasService.listAdminPoojas(getParam(req, 'templeId'));
    res.status(200).json({ data: poojas });
  }

  static async createPooja(req: Request, res: Response) {
    const created = await PoojasService.createPooja(
      getParam(req, 'templeId'),
      req.body,
      req.user?.id,
      req.ip
    );
    res.status(201).json({ data: created });
  }

  static async updatePooja(req: Request, res: Response) {
    const updated = await PoojasService.updatePooja(
      getParam(req, 'templeId'),
      getParam(req, 'id'),
      req.body,
      req.user?.id,
      req.ip
    );
    res.status(200).json({ data: updated });
  }

  static async deletePooja(req: Request, res: Response) {
    const result = await PoojasService.deletePooja(
      getParam(req, 'templeId'),
      getParam(req, 'id'),
      req.user?.id,
      req.ip
    );
    res.status(200).json({ data: result });
  }
}
