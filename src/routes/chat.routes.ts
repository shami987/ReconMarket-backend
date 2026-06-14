import { Router } from 'express';
import {
  chatIdParamSchema,
  listChatsQuerySchema,
  listMessagesQuerySchema,
  messageIdParamSchema,
  sendMessageSchema,
  startChatSchema,
} from '../schemas/chat.schema';
import * as chatService from '../services/chat.service';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authenticate);

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const result = await chatService.getUnreadCount(req.user!.id);
    res.json(result);
  }),
);

router.get(
  '/',
  validate(listChatsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await chatService.listMyChats(
      req.user!.id,
      req.validatedQuery as Parameters<typeof chatService.listMyChats>[1],
    );
    res.json(result);
  }),
);

router.post(
  '/',
  validate(startChatSchema),
  asyncHandler(async (req, res) => {
    const chat = await chatService.startChat(req.user!.id, req.body);
    res.status(201).json({ chat, message: 'Chat ready' });
  }),
);

router.get(
  '/:id',
  validate(chatIdParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const chat = await chatService.getChatById(req.params.id as string, req.user!);
    res.json({ chat });
  }),
);

router.get(
  '/:id/messages',
  validate(chatIdParamSchema, 'params'),
  validate(listMessagesQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await chatService.listMessages(
      req.params.id as string,
      req.user!,
      req.validatedQuery as Parameters<typeof chatService.listMessages>[2],
    );
    res.json(result);
  }),
);

router.post(
  '/:id/messages',
  validate(chatIdParamSchema, 'params'),
  validate(sendMessageSchema),
  asyncHandler(async (req, res) => {
    const message = await chatService.sendMessage(
      req.params.id as string,
      req.user!,
      req.body,
    );
    res.status(201).json({ message });
  }),
);

router.patch(
  '/:id/read',
  validate(chatIdParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const result = await chatService.markChatAsRead(req.params.id as string, req.user!);
    res.json(result);
  }),
);

router.patch(
  '/:id/messages/:messageId/read',
  validate(messageIdParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const message = await chatService.markMessageAsRead(
      req.params.id as string,
      req.params.messageId as string,
      req.user!,
    );
    res.json({ message });
  }),
);

export default router;
