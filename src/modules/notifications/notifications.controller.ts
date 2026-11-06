import { Request, Response } from 'express';
import { NotificationsService } from './notifications.service.js';
import { getParam } from '../../lib/params.js';

export class NotificationsController {
  static async listPublicAnnouncements(req: Request, res: Response) {
    const list = await NotificationsService.listPublicAnnouncements(getParam(req, 'id'));
    res.status(200).json({ data: list });
  }

  static async listAdminAnnouncements(req: Request, res: Response) {
    const list = await NotificationsService.listAdminAnnouncements(getParam(req, 'templeId'));
    res.status(200).json({ data: list });
  }

  static async createAnnouncement(req: Request, res: Response) {
    const created = await NotificationsService.createAnnouncement(
      getParam(req, 'templeId'),
      req.body,
      req.user!.id,
      req.ip
    );
    res.status(201).json({ data: created });
  }
}
