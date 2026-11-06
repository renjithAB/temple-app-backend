import { Router } from 'express';
import { ReportsController } from './reports.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { templeScope } from '../../middleware/templeScope.js';
import { TempleRole } from '../../generated/prisma/index.js';

// Mounted under /admin/temples/:templeId/reports
export const adminReportRoutes = Router({ mergeParams: true });

adminReportRoutes.use(authenticate(), templeScope(TempleRole.ADMIN));
adminReportRoutes.get('/summary', ReportsController.getTempleSummary);
