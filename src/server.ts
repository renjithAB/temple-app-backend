import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './db/prisma.js';
import { initJobs, stopJobs } from './jobs/index.js';

const app = createApp();

const server = app.listen(env.PORT, async () => {
  logger.info(`🛕 Temple Platform Backend API listening on port ${env.PORT} (${env.NODE_ENV})`);
  logger.info(`📖 API Documentation available at http://localhost:${env.PORT}/docs`);

  // Start background jobs scheduler
  await initJobs();
});

// Graceful Shutdown handling
let isShuttingDown = false;

async function handleShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`🛑 Received ${signal}, starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(async () => {
    logger.info('🔌 HTTP server closed, finishing pending work...');

    try {
      // 1. Stop background jobs
      await stopJobs();

      // 2. Disconnect Prisma DB pool
      await prisma.$disconnect();
      logger.info('🗄️ Database connections closed');

      logger.info('👋 Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during graceful shutdown');
      process.exit(1);
    }
  });

  // Force close if graceful shutdown exceeds 10 seconds
  setTimeout(() => {
    logger.error('⏰ Shutdown timed out after 10s, forcing exit');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
