import { Request, Response } from 'express';
import { UsersService } from './users.service.js';
import { getParam } from '../../lib/params.js';

export class UsersController {
  static async getProfile(req: Request, res: Response) {
    const profile = await UsersService.getProfile(req.user!.id);
    res.status(200).json({ data: profile });
  }

  static async updateProfile(req: Request, res: Response) {
    const updated = await UsersService.updateProfile(req.user!.id, req.body);
    res.status(200).json({ data: updated });
  }

  static async deleteAccount(req: Request, res: Response) {
    const result = await UsersService.deleteAccount(req.user!.id);
    res.status(200).json({ data: result });
  }

  static async listFamilyMembers(req: Request, res: Response) {
    const list = await UsersService.listFamilyMembers(req.user!.id);
    res.status(200).json({ data: list });
  }

  static async createFamilyMember(req: Request, res: Response) {
    const member = await UsersService.createFamilyMember(req.user!.id, req.body);
    res.status(201).json({ data: member });
  }

  static async updateFamilyMember(req: Request, res: Response) {
    const updated = await UsersService.updateFamilyMember(
      req.user!.id,
      getParam(req, 'id'),
      req.body
    );
    res.status(200).json({ data: updated });
  }

  static async deleteFamilyMember(req: Request, res: Response) {
    const result = await UsersService.deleteFamilyMember(req.user!.id, getParam(req, 'id'));
    res.status(200).json({ data: result });
  }

  static async registerDevice(req: Request, res: Response) {
    const result = await UsersService.registerDeviceToken(
      req.user!.id,
      req.body.fcmToken,
      req.body.platform
    );
    res.status(200).json({ data: result });
  }

  static async unregisterDevice(req: Request, res: Response) {
    const result = await UsersService.unregisterDeviceToken(
      req.user!.id,
      getParam(req, 'fcmToken')
    );
    res.status(200).json({ data: result });
  }
}
