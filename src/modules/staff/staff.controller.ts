import { Request, Response } from 'express';
import { StaffService } from './staff.service.js';
import { getParam } from '../../lib/params.js';

export class StaffController {
  static async listStaff(req: Request, res: Response) {
    const staff = await StaffService.listStaff(getParam(req, 'templeId'));
    res.status(200).json({ data: staff });
  }

  static async assignStaff(req: Request, res: Response) {
    const staff = await StaffService.assignStaff(
      getParam(req, 'templeId'),
      req.body,
      req.user?.id,
      req.ip
    );
    res.status(200).json({ data: staff });
  }

  static async removeStaff(req: Request, res: Response) {
    const result = await StaffService.removeStaff(
      getParam(req, 'templeId'),
      getParam(req, 'userId'),
      req.user?.id,
      req.ip
    );
    res.status(200).json({ data: result });
  }
}
