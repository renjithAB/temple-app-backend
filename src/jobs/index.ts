import PgBoss from 'pg-boss';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { JobTasks } from './tasks.js';

let boss: PgBoss | null = null;
let intervalTimers: NodeJS.Timeout[] = [];

export async function initJobs() {
  if (!env.RUN_JOBS) {
    logger.info('⏸️ Background jobs disabled (RUN_JOBS=false)');
    return;
  }

  logger.info('🚀 Initializing background jobs scheduler...');

  if (!env.DATABASE_URL.startsWith('postgres')) {
    logger.info('ℹ️ SQLite / Cloudflare D1 environment detected: using interval job timers');
    const hourlyTimer = setInterval(async () => {
      try {
        await JobTasks.bookingReminders();
      } catch (e) {
        logger.error({ e }, 'Interval reminder error');
      }
    }, 60 * 60 * 1000);

    const dailyTimer = setInterval(async () => {
      try {
        await JobTasks.generateSlotInventory();
        await JobTasks.completePastBookings();
        await JobTasks.cleanup();
      } catch (e) {
        logger.error({ e }, 'Interval maintenance job error');
      }
    }, 24 * 60 * 60 * 1000);

    intervalTimers.push(hourlyTimer, dailyTimer);
    return;
  }

  try {
    boss = new PgBoss({
      connectionString: env.DATABASE_URL,
      archiveCompletedAfterSeconds: 60 * 60 * 24, // 1 day
      deleteAfterDays: 7,
    });

    boss.on('error', (err) => {
      logger.warn({ err: err.message }, 'pg-boss worker warning (falling back to interval runners if DB queue unavailable)');
    });

    await boss.start();

    // Register job queues
    await boss.createQueue('generate-slot-inventory');
    await boss.createQueue('booking-reminders');
    await boss.createQueue('complete-past-bookings');
    await boss.createQueue('cleanup');

    // Register workers
    await boss.work('generate-slot-inventory', async () => {
      await JobTasks.generateSlotInventory();
    });

    await boss.work('booking-reminders', async () => {
      await JobTasks.bookingReminders();
    });

    await boss.work('complete-past-bookings', async () => {
      await JobTasks.completePastBookings();
    });

    await boss.work('cleanup', async () => {
      await JobTasks.cleanup();
    });

    // Schedules using cron syntax
    // Nightly at 00:05 UTC
    await boss.schedule('generate-slot-inventory', '5 0 * * *', {});
    // Hourly
    await boss.schedule('booking-reminders', '0 * * * *', {});
    // Nightly at 23:55 UTC
    await boss.schedule('complete-past-bookings', '55 23 * * *', {});
    // Daily at 02:00 UTC
    await boss.schedule('cleanup', '0 2 * * *', {});

    logger.info('✅ pg-boss background jobs scheduled successfully');
  } catch (err) {
    logger.warn({ err }, '⚠️ pg-boss initialization skipped (using fallback in-memory job timers)');

    // Fallback in-memory interval timers for dev/test when pg-boss queue schema is not yet deployed
    const hourlyTimer = setInterval(async () => {
      try {
        await JobTasks.bookingReminders();
      } catch (e) {
        logger.error({ e }, 'Interval reminder error');
      }
    }, 60 * 60 * 1000);

    const dailyTimer = setInterval(async () => {
      try {
        await JobTasks.generateSlotInventory();
        await JobTasks.completePastBookings();
        await JobTasks.cleanup();
      } catch (e) {
        logger.error({ e }, 'Interval maintenance job error');
      }
    }, 24 * 60 * 60 * 1000);

    intervalTimers.push(hourlyTimer, dailyTimer);
  }
}

export async function stopJobs() {
  for (const timer of intervalTimers) {
    clearInterval(timer);
  }
  intervalTimers = [];

  if (boss) {
    try {
      await boss.stop({ graceful: true, timeout: 5000 });
      logger.info('🛑 pg-boss stopped gracefully');
    } catch (err) {
      logger.error({ err }, 'Error stopping pg-boss');
    }
  }
}
