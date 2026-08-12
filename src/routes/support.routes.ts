import { Router } from 'express';
import {
  createSupportTicketSchema,
  listSupportTicketsQuerySchema,
  supportTicketIdParamSchema,
  supportTicketReplySchema,
} from '../schemas/support.schema';
import * as supportService from '../services/support.service';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// ─── User routes ────────────────────────────────────────────────

router.post(
  '/',
  authenticate,
  validate(createSupportTicketSchema),
  asyncHandler(async (req, res) => {
    const ticket = await supportService.createSupportTicket({
      userId: req.user!.id,
      subject: req.body.subject,
      message: req.body.message,
    });
    res.status(201).json({ ticket });
  }),
);

router.get(
  '/me',
  authenticate,
  validate(listSupportTicketsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await supportService.listMySupportTickets(
      req.user!.id,
      req.validatedQuery as Parameters<typeof supportService.listMySupportTickets>[1],
    );
    res.json(result);
  }),
);

// ─── Admin routes ───────────────────────────────────────────────

const adminRouter = Router();
adminRouter.use(authenticate, requireRole('ADMIN'));

adminRouter.get(
  '/',
  validate(listSupportTicketsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await supportService.listAllSupportTickets(
      req.validatedQuery as Parameters<typeof supportService.listAllSupportTickets>[0],
    );
    res.json(result);
  }),
);

adminRouter.get(
  '/open-count',
  asyncHandler(async (_req, res) => {
    const result = await supportService.getOpenSupportTicketCount();
    res.json(result);
  }),
);

adminRouter.patch(
  '/:id/reply',
  validate(supportTicketIdParamSchema, 'params'),
  validate(supportTicketReplySchema),
  asyncHandler(async (req, res) => {
    const ticket = await supportService.replyToSupportTicket(
      req.params.id as string,
      req.user!.id,
      req.body,
    );
    res.json({ ticket });
  }),
);

router.use('/admin', adminRouter);

router.get(
  '/:id',
  authenticate,
  validate(supportTicketIdParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const ticket = await supportService.getSupportTicket(
      req.params.id as string,
      req.user!.id,
    );
    res.json({ ticket });
  }),
);

export default router;