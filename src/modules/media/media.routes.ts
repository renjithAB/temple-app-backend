import { Router } from 'express';
import multer from 'multer';
import { MediaController } from './media.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { templeScope } from '../../middleware/templeScope.js';
import { TempleRole } from '../../generated/prisma/index.js';
import { APP_CONSTANTS } from '../../config/constants.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: APP_CONSTANTS.MEDIA.MAX_IMAGE_SIZE_BYTES,
  },
});

export const mediaRoutes = Router({ mergeParams: true });

mediaRoutes.use(authenticate(), templeScope(TempleRole.ADMIN));

mediaRoutes.post('/images', upload.single('image'), MediaController.uploadImage);
mediaRoutes.get('/images', MediaController.listMedia);
mediaRoutes.delete('/images/:id', MediaController.deleteMedia);
