import { Router } from 'express';
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
} from '../schemas/notification.schema';
import * as notificationService from '../services/notification.service';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authenticate);

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const result = await notificationService.getUnreadNotificationCount(req.user!.id);
    res.json(result);
  }),
);

router.get(
  '/',
  validate(listNotificationsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await notificationService.listNotifications(
      req.user!.id,
      req.validatedQuery as Parameters<typeof notificationService.listNotifications>[1],
    );
    res.json(result);
  }),
);

router.patch(
  '/read-all',
  asyncHandler(async (req, res) => {
    const result = await notificationService.markAllNotificationsRead(req.user!.id);
    res.json(result);
  }),
);

router.patch(
  '/:id/read',
  validate(notificationIdParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const notification = await notificationService.markNotificationRead(
      req.params.id as string,
      req.user!.id,
    );
    res.json({ notification });
  }),
);

export default router;
