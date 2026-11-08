import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { JobTasks } from './tasks.js';

let intervalTimers: NodeJS.Timeout[] = [];

export async function initJobs() {
  if (!env.RUN_JOBS) {
    logger.info('⏸️ Background jobs disabled (RUN_JOBS=false)');
    return;
  }

  logger.info('🚀 Initializing background jobs scheduler (interval timers)...');

  // Hourly booking reminder notifications
  const hourlyTimer = setInterval(async () => {
    try {
      await JobTasks.bookingReminders();
    } catch (e) {
      logger.error({ e }, 'Interval reminder error');
    }
  }, 60 * 60 * 1000);

  // Daily maintenance: slot inventory generation, completion, and cleanup
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

export async function stopJobs() {
  for (const timer of intervalTimers) {
    clearInterval(timer);
  }
  intervalTimers = [];
  logger.info('🛑 Background job timers stopped');
}
