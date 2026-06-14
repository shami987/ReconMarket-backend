import { NotificationType, Prisma } from '@prisma/client';
import { AppError } from '../errors/AppError';
import { prisma } from '../lib/prisma';

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
};

type DbClient = Prisma.TransactionClient | typeof prisma;

const getClient = (tx?: Prisma.TransactionClient): DbClient => tx ?? prisma;

export const createNotification = async (
  input: CreateNotificationInput,
  tx?: Prisma.TransactionClient,
) =>
  getClient(tx).notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data,
    },
  });

export const createNotifications = async (
  inputs: CreateNotificationInput[],
  tx?: Prisma.TransactionClient,
) => {
  if (inputs.length === 0) {
    return [];
  }

  const client = getClient(tx);

  return Promise.all(
    inputs.map((input) =>
      client.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          data: input.data,
        },
      }),
    ),
  );
};

export const listNotifications = async (
  userId: string,
  query: {
    page: number;
    limit: number;
    unreadOnly?: boolean;
    type?: NotificationType;
  },
) => {
  const where: Prisma.NotificationWhereInput = {
    userId,
    ...(query.unreadOnly && { isRead: false }),
    ...(query.type && { type: query.type }),
  };

  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  return {
    items,
    unreadCount,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

export const getUnreadNotificationCount = async (userId: string) => {
  const unreadCount = await prisma.notification.count({
    where: { userId, isRead: false },
  });

  return { unreadCount };
};

export const markNotificationRead = async (id: string, userId: string) => {
  const notification = await prisma.notification.findFirst({
    where: { id, userId },
  });

  if (!notification) {
    throw new AppError(404, 'Notification not found');
  }

  if (notification.isRead) {
    return notification;
  }

  return prisma.notification.update({
    where: { id },
    data: { isRead: true, readAt: new Date() },
  });
};

export const markAllNotificationsRead = async (userId: string) => {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });

  return { markedRead: result.count, readAt: new Date() };
};
