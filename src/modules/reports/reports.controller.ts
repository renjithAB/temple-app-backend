import { Request, Response } from 'express';
import { ReportsService } from './reports.service.js';
import { getParam } from '../../lib/params.js';

export class ReportsController {
  static async getTempleSummary(req: Request, res: Response) {
    const days = Number(req.query.days) || 30;
    const summary = await ReportsService.getTempleSummary(getParam(req, 'templeId'), days);
    res.status(200).json({ data: summary });
  }

  static async getPlatformSummary(req: Request, res: Response) {
    const summary = await ReportsService.getPlatformSummary();
    res.status(200).json({ data: summary });
  }
}
