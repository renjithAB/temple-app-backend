import { prisma } from '../db/prisma.js';
import { pushService } from '../integrations/push/index.js';
import { Weekday, BookingStatus } from '../generated/prisma/index.js';
import { logger } from '../lib/logger.js';

const WEEKDAY_MAP: Record<number, Weekday> = {
  0: Weekday.SUN,
  1: Weekday.MON,
  2: Weekday.TUE,
  3: Weekday.WED,
  4: Weekday.THU,
  5: Weekday.FRI,
  6: Weekday.SAT,
};

export class JobTasks {
  /**
   * Nightly job: Generates slot inventory for all active schedules within each temple's bookingAdvanceDays window
   */
  static async generateSlotInventory(): Promise<{ generatedCount: number }> {
    logger.info('🔄 Starting generate-slot-inventory job...');

    const activeTemples = await prisma.temple.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      include: {
        poojas: {
          where: { isActive: true, deletedAt: null, requiresBooking: true },
          include: {
            schedules: {
              where: { isActive: true },
            },
          },
        },
      },
    });

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    let totalCreated = 0;

    for (const temple of activeTemples) {
      const advanceDays = temple.bookingAdvanceDays;

      for (const pooja of temple.poojas) {
        for (const schedule of pooja.schedules) {
          const rowsToInsert = [];

          for (let i = 0; i <= advanceDays; i++) {
            const slotDate = new Date(today);
            slotDate.setDate(today.getDate() + i);

            if (WEEKDAY_MAP[slotDate.getUTCDay()] === schedule.weekday) {
              rowsToInsert.push({
                scheduleId: schedule.id,
                templeId: temple.id,
                slotDate,
                capacity: schedule.capacity,
                booked: 0,
                isBlocked: false,
              });
            }
          }

          if (rowsToInsert.length > 0) {
            for (const row of rowsToInsert) {
              await prisma.slotInventory.upsert({
                where: {
                  scheduleId_slotDate: {
                    scheduleId: row.scheduleId,
                    slotDate: row.slotDate,
                  },
                },
                update: {},
                create: row,
              });
              totalCreated++;
            }
          }
        }
      }
    }

    logger.info({ totalCreated }, '✅ generate-slot-inventory job completed');
    return { generatedCount: totalCreated };
  }

  /**
   * Hourly job: Pushes reminders to devotees whose booking is scheduled for tomorrow
   */
  static async bookingReminders(): Promise<{ sentCount: number }> {
    logger.info('🔄 Starting booking-reminders job...');

    const tomorrow = new Date();
    tomorrow.setUTCHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const upcomingBookings = await prisma.booking.findMany({
      where: {
        bookingDate: tomorrow,
        status: BookingStatus.CONFIRMED,
      },
      include: {
        pooja: { select: { name: true } },
        temple: { select: { name: true } },
        user: {
          include: { devices: true },
        },
      },
    });

    let sent = 0;

    for (const booking of upcomingBookings) {
      const message = `Reminder: Your ${booking.pooja.name} at ${booking.temple.name} is scheduled for tomorrow at ${booking.startTime}. Booking code: ${booking.code}.`;

      for (const device of booking.user.devices) {
        await pushService.sendToDevice(device.fcmToken, {
          title: 'Upcoming Pooja Tomorrow',
          body: message,
          data: {
            type: 'booking_reminder',
            bookingId: booking.id,
          },
        });
        sent++;
      }
    }

    logger.info({ sentBookingsCount: upcomingBookings.length, pushCount: sent }, '✅ booking-reminders job completed');
    return { sentCount: sent };
  }

  /**
   * Nightly job: Marks past confirmed bookings as COMPLETED (or NO_SHOW if unattended)
   */
  static async completePastBookings(): Promise<{ completedCount: number }> {
    logger.info('🔄 Starting complete-past-bookings job...');

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const pastBookings = await prisma.booking.findMany({
      where: {
        bookingDate: { lt: today },
        status: BookingStatus.CONFIRMED,
      },
    });

    let updatedCount = 0;

    for (const booking of pastBookings) {
      const targetStatus = booking.checkedInAt
        ? BookingStatus.COMPLETED
        : BookingStatus.NO_SHOW;

      await prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: targetStatus },
        });

        await tx.bookingStatusHistory.create({
          data: {
            bookingId: booking.id,
            fromStatus: BookingStatus.CONFIRMED,
            toStatus: targetStatus,
            reason: 'Automated end-of-day closure job',
          },
        });
      });
      updatedCount++;
    }

    logger.info({ updatedCount }, '✅ complete-past-bookings job completed');
    return { completedCount: updatedCount };
  }

  /**
   * Daily job: Cleans up expired OTP codes and revoked/expired refresh sessions
   */
  static async cleanup(): Promise<{ deletedOtpCount: number; deletedSessionCount: number }> {
    logger.info('🔄 Starting cleanup job...');

    const now = new Date();

    const [deletedOtps, deletedSessions] = await Promise.all([
      prisma.otpCode.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { consumedAt: { not: null } },
          ],
        },
      }),
      prisma.refreshSession.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { revokedAt: { not: null } },
          ],
        },
      }),
    ]);

    logger.info(
      { deletedOtps: deletedOtps.count, deletedSessions: deletedSessions.count },
      '✅ cleanup job completed'
    );

    return {
      deletedOtpCount: deletedOtps.count,
      deletedSessionCount: deletedSessions.count,
    };
  }
}
