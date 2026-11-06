import { prisma } from '../../db/prisma.js';
import { BookingStatus, GlobalRole } from '../../generated/prisma/index.js';

export class ReportsService {
  static async getTempleSummary(templeId: string, days = 30) {
    const startDate = new Date();
    startDate.setUTCHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - days);

    const bookings = await prisma.booking.findMany({
      where: {
        templeId,
        createdAt: { gte: startDate },
      },
      select: {
        bookingDate: true,
        poojaId: true,
        pooja: { select: { name: true } },
        status: true,
        devoteeCount: true,
        totalPaise: true,
      },
    });

    // Aggregate by status
    const byStatus = {
      CONFIRMED: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      NO_SHOW: 0,
    };

    let totalRevenuePaise = 0;
    let totalDevotees = 0;

    const byPooja: Record<
      string,
      { name: string; bookingsCount: number; devoteesCount: number; revenuePaise: number }
    > = {};

    const byDate: Record<
      string,
      { date: string; bookingsCount: number; revenuePaise: number }
    > = {};

    for (const b of bookings) {
      byStatus[b.status] = (byStatus[b.status] || 0) + 1;

      if (b.status === BookingStatus.CONFIRMED || b.status === BookingStatus.COMPLETED) {
        totalRevenuePaise += b.totalPaise;
        totalDevotees += b.devoteeCount;

        // By Pooja
        if (!byPooja[b.poojaId]) {
          byPooja[b.poojaId] = {
            name: b.pooja.name,
            bookingsCount: 0,
            devoteesCount: 0,
            revenuePaise: 0,
          };
        }
        byPooja[b.poojaId].bookingsCount += 1;
        byPooja[b.poojaId].devoteesCount += b.devoteeCount;
        byPooja[b.poojaId].revenuePaise += b.totalPaise;

        // By Date
        const dateKey = b.bookingDate.toISOString().split('T')[0];
        if (!byDate[dateKey]) {
          byDate[dateKey] = { date: dateKey, bookingsCount: 0, revenuePaise: 0 };
        }
        byDate[dateKey].bookingsCount += 1;
        byDate[dateKey].revenuePaise += b.totalPaise;
      }
    }

    return {
      templeId,
      timeWindowDays: days,
      totalBookings: bookings.length,
      totalDevotees,
      totalRevenuePaise,
      byStatus,
      byPooja: Object.values(byPooja),
      dailyTrend: Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  static async getPlatformSummary() {
    const [templesCount, activeTemplesCount, devoteesCount, bookings] = await Promise.all([
      prisma.temple.count({ where: { deletedAt: null } }),
      prisma.temple.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      prisma.user.count({ where: { role: GlobalRole.DEVOTEE } }),
      prisma.booking.findMany({
        select: {
          status: true,
          totalPaise: true,
          devoteeCount: true,
        },
      }),
    ]);

    let totalRevenuePaise = 0;
    let totalDevoteesAttended = 0;
    const byStatus = {
      CONFIRMED: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      NO_SHOW: 0,
    };

    for (const b of bookings) {
      byStatus[b.status] = (byStatus[b.status] || 0) + 1;
      if (b.status === BookingStatus.CONFIRMED || b.status === BookingStatus.COMPLETED) {
        totalRevenuePaise += b.totalPaise;
        totalDevoteesAttended += b.devoteeCount;
      }
    }

    return {
      totalTemples: templesCount,
      activeTemples: activeTemplesCount,
      totalDevotees: devoteesCount,
      totalBookings: bookings.length,
      totalRevenuePaise,
      totalDevoteesAttended,
      byStatus,
    };
  }
}
