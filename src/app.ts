import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';

import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './db/prisma.js';

// Middlewares
import { requestIdMiddleware } from './middleware/requestId.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { notFoundHandler } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

// Route modules
import { authRoutes } from './modules/auth/auth.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';
import {
  publicTempleRoutes,
  adminTempleRoutes,
} from './modules/temples/temples.routes.js';
import {
  publicPoojaRoutes,
  adminPoojaRoutes,
} from './modules/poojas/poojas.routes.js';
import { scheduleRoutes } from './modules/slots/slots.routes.js';
import {
  publicOccasionRoutes,
  adminOccasionRoutes,
} from './modules/occasions/occasions.routes.js';
import {
  publicAnnouncementRoutes,
  adminAnnouncementRoutes,
} from './modules/notifications/notifications.routes.js';
import {
  devoteeBookingRoutes,
  adminBookingRoutes,
} from './modules/bookings/bookings.routes.js';
import { mediaRoutes } from './modules/media/media.routes.js';
import { adminReportRoutes } from './modules/reports/reports.routes.js';
import { superRoutes } from './modules/super/super.routes.js';
import { staffRoutes } from './modules/staff/staff.routes.js';

// OpenAPI Spec
import { openApiSpec } from './docs/openapi.js';

export function createApp() {
  const app = express();

  // Configure trust proxy
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  // 1. Request ID Middleware
  app.use(requestIdMiddleware);

  // 2. Structured Request Logger
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const msg = `${req.method} ${req.originalUrl || req.url} ${res.statusCode} - ${duration}ms`;
      if (res.statusCode >= 500) {
        logger.error({ id: req.id, status: res.statusCode, duration }, msg);
      } else if (res.statusCode >= 400) {
        logger.warn({ id: req.id, status: res.statusCode, duration }, msg);
      } else {
        logger.info({ id: req.id, status: res.statusCode, duration }, msg);
      }
    });
    next();
  });

  // 3. Security Headers
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
          imgSrc: ["'self'", 'data:', 'https:', 'http:'],
        },
      },
    })
  );

  // 4. Strict CORS
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps or curl)
        if (!origin) return callback(null, true);
        if (env.CORS_ORIGINS.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Requested-With', 'X-Request-Id'],
    })
  );

  // 5. Global Rate Limiter
  app.use(globalLimiter);

  // 6. Body Parsers with 100KB size limit
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  // Static files for local uploads (development)
  app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

  // Health and Readiness Checks (Section 3)
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/ready', async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: 'ready', database: 'connected' });
    } catch (err) {
      res.status(503).json({ status: 'unready', database: 'disconnected' });
    }
  });

  // Swagger UI & OpenAPI Specification
  app.get('/api/v1/openapi.json', (req, res) => {
    res.status(200).json(openApiSpec);
  });

  const swaggerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Temple Platform API - Swagger UI</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.18.2/swagger-ui.css" />
  <style>
    body { margin: 0; background: #fafafa; }
    .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.18.2/swagger-ui-bundle.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.18.2/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/api/v1/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>`;

  app.get(['/docs', '/docs/'], (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(swaggerHtml);
  });

  // Mount API v1 Routes
  const v1 = express.Router();

  // Auth & Profile
  v1.use('/auth', authRoutes);
  v1.use('/', usersRoutes);

  // Public browsing
  v1.use('/', publicTempleRoutes);
  v1.use('/', publicPoojaRoutes);
  v1.use('/', publicOccasionRoutes);
  v1.use('/', publicAnnouncementRoutes);

  // Devotee bookings
  v1.use('/bookings', devoteeBookingRoutes);

  // Temple Admin and Staff sub-router
  const templeAdmin = express.Router({ mergeParams: true });
  templeAdmin.use('/', adminTempleRoutes);
  templeAdmin.use('/staff', staffRoutes);
  templeAdmin.use('/poojas', adminPoojaRoutes);
  templeAdmin.use('/', scheduleRoutes);
  templeAdmin.use('/occasions', adminOccasionRoutes);
  templeAdmin.use('/announcements', adminAnnouncementRoutes);
  templeAdmin.use('/bookings', adminBookingRoutes);
  templeAdmin.use('/media', mediaRoutes);
  templeAdmin.use('/reports', adminReportRoutes);

  v1.use('/admin/temples/:templeId', templeAdmin);

  // Super Admin
  v1.use('/super', superRoutes);

  app.use('/api/v1', v1);

  // 404 Handler
  app.use(notFoundHandler);

  // Central Error Handler
  app.use(errorHandler);

  return app;
}
