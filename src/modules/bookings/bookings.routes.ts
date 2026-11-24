import { Router } from 'express';
import { BookingsController } from './bookings.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { templeScope } from '../../middleware/templeScope.js';
import { validate } from '../../middleware/validate.js';
import { TempleRole } from '../../generated/prisma/index.js';
import { bookingCreationLimiter } from '../../middleware/rateLimit.js';
import {
  createBookingSchema,
  cancelBookingSchema,
  rescheduleBookingSchema,
  checkInSchema,
  updateBookingStatusSchema,
  listBookingsQuerySchema,
  verifyPaymentSchema,
  counterRefundSchema,
} from './bookings.schema.js';

// Devotee router (mounted under /bookings)
export const devoteeBookingRoutes = Router();

devoteeBookingRoutes.use(authenticate());

devoteeBookingRoutes.post(
  '/',
  bookingCreationLimiter,
  validate({ body: createBookingSchema }),
  BookingsController.createBooking
);

devoteeBookingRoutes.get(
  '/',
  validate({ query: listBookingsQuerySchema }),
  BookingsController.listDevoteeBookings
);

devoteeBookingRoutes.get('/:id', BookingsController.getDevoteeBooking);

devoteeBookingRoutes.post(
  '/:id/cancel',
  validate({ body: cancelBookingSchema }),
  BookingsController.cancelBooking
);

devoteeBookingRoutes.post(
  '/:id/reschedule',
  validate({ body: rescheduleBookingSchema }),
  BookingsController.rescheduleBooking
);

devoteeBookingRoutes.post(
  '/verify-payment',
  validate({ body: verifyPaymentSchema }),
  BookingsController.verifyPayment
);

devoteeBookingRoutes.post(
  '/:id/sync-payment',
  BookingsController.syncPayment
);

// Admin / Staff router (mounted under /admin/temples/:templeId/bookings)
export const adminBookingRoutes = Router({ mergeParams: true });

// Check-in and booking viewing requires STAFF
adminBookingRoutes.get(
  '/',
  authenticate(),
  templeScope(TempleRole.STAFF),
  validate({ query: listBookingsQuerySchema }),
  BookingsController.listTempleBookings
);

adminBookingRoutes.get(
  '/:id',
  authenticate(),
  templeScope(TempleRole.STAFF),
  BookingsController.getTempleBooking
);

adminBookingRoutes.post(
  '/check-in',
  authenticate(),
  templeScope(TempleRole.STAFF),
  validate({ body: checkInSchema }),
  BookingsController.checkIn
);

adminBookingRoutes.patch(
  '/:id/status',
  authenticate(),
  templeScope(TempleRole.STAFF),
  validate({ body: updateBookingStatusSchema }),
  BookingsController.updateStatus
);

// CSV Export requires ADMIN
adminBookingRoutes.get(
  '/export/csv',
  authenticate(),
  templeScope(TempleRole.ADMIN),
  BookingsController.exportCsv
);

// Staff marks counter cash refund handed over
adminBookingRoutes.post(
  '/:id/counter-refund',
  authenticate(),
  templeScope(TempleRole.STAFF),
  validate({ body: counterRefundSchema }),
  BookingsController.markCounterRefund
);

// Razorpay Webhook listener (Public endpoint, signature verified inside controller)
export const paymentsWebhookRouter = Router();
paymentsWebhookRouter.post('/webhook', BookingsController.handleWebhook);
