import { Request, Response } from 'express';
import { SuperService } from './super.service.js';
import { ReportsService } from '../reports/reports.service.js';
import { getParam } from '../../lib/params.js';
import { AppError } from '../../lib/errors.js';

export class SuperController {
  static async uploadImage(req: Request, res: Response) {
    if (!req.file || !req.file.buffer) {
      throw AppError.badRequest('No image file uploaded');
    }
    const result = await SuperService.uploadImage(req.file.buffer);
    res.status(201).json({ data: result });
  }

  static async updateTempleDetails(req: Request, res: Response) {
    const updated = await SuperService.updateTempleDetails(
      getParam(req, 'id'),
      req.body,
      req.user?.id,
      req.ip
    );
    res.status(200).json({ data: updated });
  }
  static async createTemple(req: Request, res: Response) {
    const temple = await SuperService.createTemple(
      req.body,
      req.user?.id,
      req.ip
    );
    res.status(201).json({ data: temple });
  }

  static async updateTempleStatus(req: Request, res: Response) {
    const updated = await SuperService.updateTempleStatus(
      getParam(req, 'id'),
      req.body.status,
      req.user?.id,
      req.ip
    );
    res.status(200).json({ data: updated });
  }

  static async assignTempleAdmin(req: Request, res: Response) {
    const staff = await SuperService.assignTempleAdmin(
      getParam(req, 'id'),
      req.body,
      req.user?.id,
      req.ip
    );
    res.status(200).json({ data: staff });
  }

  static async listTemples(req: Request, res: Response) {
    const result = await SuperService.listAllTemples(req.query);
    res.status(200).json(result);
  }

  static async listUsers(req: Request, res: Response) {
    const result = await SuperService.listUsers(req.query);
    res.status(200).json(result);
  }

  static async updateUserStatus(req: Request, res: Response) {
    const updated = await SuperService.setUserActive(
      getParam(req, 'id'),
      req.body.isActive,
      req.user?.id,
      req.ip
    );
    res.status(200).json({ data: updated });
  }

  static async createUser(req: Request, res: Response) {
    const user = await SuperService.createUser(req.body, req.user?.id, req.ip);
    res.status(201).json({ data: user });
  }

  static async updateUser(req: Request, res: Response) {
    const updated = await SuperService.updateUser(getParam(req, 'id'), req.body, req.user?.id, req.ip);
    res.status(200).json({ data: updated });
  }

  static async resetUserPassword(req: Request, res: Response) {
    const result = await SuperService.resetUserPassword(getParam(req, 'id'), req.body.newPassword, req.user?.id, req.ip);
    res.status(200).json({ data: result });
  }

  static async listAllPoojas(req: Request, res: Response) {
    const result = await SuperService.listAllPoojas(req.query);
    res.status(200).json(result);
  }

  static async listAllOccasions(req: Request, res: Response) {
    const result = await SuperService.listAllOccasions(req.query);
    res.status(200).json(result);
  }

  static async getPlatformSummary(req: Request, res: Response) {
    const summary = await ReportsService.getPlatformSummary();
    res.status(200).json({ data: summary });
  }
}
