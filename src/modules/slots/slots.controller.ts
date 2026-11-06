import { Request, Response } from 'express';
import { SlotsService } from './slots.service.js';
import { getParam } from '../../lib/params.js';

export class SlotsController {
  static async listSchedules(req: Request, res: Response) {
    const list = await SlotsService.listSchedules(
      getParam(req, 'templeId'),
      getParam(req, 'poojaId')
    );
    res.status(200).json({ data: list });
  }

  static async createSchedule(req: Request, res: Response) {
    const created = await SlotsService.createSchedule(
      getParam(req, 'templeId'),
      getParam(req, 'poojaId'),
      req.body,
      req.user?.id,
      req.ip
    );
    res.status(201).json({ data: created });
  }

  static async updateSchedule(req: Request, res: Response) {
    const updated = await SlotsService.updateSchedule(
      getParam(req, 'templeId'),
      getParam(req, 'id'),
      req.body,
      req.user?.id,
      req.ip
    );
    res.status(200).json({ data: updated });
  }

  static async deleteSchedule(req: Request, res: Response) {
    const result = await SlotsService.deleteSchedule(
      getParam(req, 'templeId'),
      getParam(req, 'id'),
      req.user?.id,
      req.ip
    );
    res.status(200).json({ data: result });
  }

  static async blockDate(req: Request, res: Response) {
    const result = await SlotsService.blockDate(
      getParam(req, 'templeId'),
      getParam(req, 'id'),
      req.body,
      req.user?.id,
      req.ip
    );
    res.status(200).json({ data: result });
  }
}
