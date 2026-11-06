import { Request, Response } from 'express';
import { BookingsService } from './bookings.service.js';
import { APP_CONSTANTS } from '../../config/constants.js';
import { getParam } from '../../lib/params.js';

export class BookingsController {
  static async createBooking(req: Request, res: Response) {
    const idempotencyKey = req.headers[
      APP_CONSTANTS.BOOKING.IDEMPOTENCY_HEADER
    ] as string | undefined;

    const booking = await BookingsService.createBooking(
      req.user!.id,
      req.body,
      idempotencyKey
    );

    res.status(201).json({ data: booking });
  }

  static async listDevoteeBookings(req: Request, res: Response) {
    const list = await BookingsService.listDevoteeBookings(req.user!.id, req.query);
    res.status(200).json(list);
  }

  static async getDevoteeBooking(req: Request, res: Response) {
    const booking = await BookingsService.getDevoteeBooking(
      req.user!.id,
      getParam(req, 'id')
    );
    res.status(200).json({ data: booking });
  }

  static async cancelBooking(req: Request, res: Response) {
    const cancelled = await BookingsService.cancelBookingByDevotee(
      req.user!.id,
      getParam(req, 'id'),
      req.body.reason
    );
    res.status(200).json({ data: cancelled });
  }

  static async rescheduleBooking(req: Request, res: Response) {
    const rescheduled = await BookingsService.rescheduleBooking(
      req.user!.id,
      getParam(req, 'id'),
      req.body.newScheduleId,
      req.body.newDate
    );
    res.status(200).json({ data: rescheduled });
  }

  static async listTempleBookings(req: Request, res: Response) {
    const result = await BookingsService.listTempleBookings(
      getParam(req, 'templeId'),
      req.query
    );
    res.status(200).json(result);
  }

  static async getTempleBooking(req: Request, res: Response) {
    const booking = await BookingsService.getTempleBooking(
      getParam(req, 'templeId'),
      getParam(req, 'id')
    );
    res.status(200).json({ data: booking });
  }

  static async checkIn(req: Request, res: Response) {
    const result = await BookingsService.checkInByQr(
      getParam(req, 'templeId'),
      req.user!.id,
      req.body.qrPayload
    );
    res.status(200).json({ data: result });
  }

  static async updateStatus(req: Request, res: Response) {
    const updated = await BookingsService.updateBookingStatusByStaff(
      getParam(req, 'templeId'),
      req.user!.id,
      getParam(req, 'id'),
      req.body.status,
      req.body.reason
    );
    res.status(200).json({ data: updated });
  }

  static async exportCsv(req: Request, res: Response) {
    const templeId = getParam(req, 'templeId');
    const csvContent = await BookingsService.exportBookingsCsv(
      templeId,
      req.query
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="bookings_${templeId}_${new Date().toISOString().split('T')[0]}.csv"`
    );
    res.status(200).send(csvContent);
  }
}
