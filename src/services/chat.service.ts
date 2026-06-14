import { MessageType, Prisma, User } from '@prisma/client';
import { AppError } from '../errors/AppError';
import { prisma } from '../lib/prisma';
import { notifyNewMessage } from './notification.triggers';

const chatParticipantSelect = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  verificationType: true,
} as const;

const listingSummarySelect = {
  id: true,
  title: true,
  price: true,
  currency: true,
  status: true,
  images: {
    orderBy: { sortOrder: 'asc' as const },
    take: 1,
    select: { url: true, isPrimary: true },
  },
} as const;

const chatInclude = {
  buyer: { select: chatParticipantSelect },
  seller: { select: chatParticipantSelect },
  listing: { select: listingSummarySelect },
  transaction: {
    select: { id: true, status: true },
  },
} satisfies Prisma.ChatInclude;

const messageInclude = {
  sender: { select: chatParticipantSelect },
} satisfies Prisma.MessageInclude;

type ChatWithRelations = Prisma.ChatGetPayload<{ include: typeof chatInclude }>;

const assertChatParticipant = (chat: { buyerId: string; sellerId: string }, user: User) => {
  if (chat.buyerId !== user.id && chat.sellerId !== user.id && user.role !== 'ADMIN') {
    throw new AppError(403, 'You can only access your own chats');
  }
};

const getOtherParticipantId = (chat: { buyerId: string; sellerId: string }, userId: string) =>
  chat.buyerId === userId ? chat.sellerId : chat.buyerId;

const serializeChat = async (chat: ChatWithRelations, viewerId: string) => {
  const unreadCount = await prisma.message.count({
    where: {
      chatId: chat.id,
      senderId: { not: viewerId },
      readAt: null,
      isDeleted: false,
    },
  });

  const lastMessage = await prisma.message.findFirst({
    where: { chatId: chat.id, isDeleted: false },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      content: true,
      type: true,
      senderId: true,
      createdAt: true,
      readAt: true,
    },
  });

  const isBuyer = chat.buyerId === viewerId;

  return {
    ...chat,
    role: isBuyer ? ('buyer' as const) : ('seller' as const),
    otherParticipant: isBuyer ? chat.seller : chat.buyer,
    unreadCount,
    lastMessage,
  };
};

export const startChat = async (
  userId: string,
  input: {
    listingId: string;
    buyerId?: string;
    transactionId?: string;
    initialMessage?: string;
  },
) => {
  const listing = await prisma.listing.findFirst({
    where: { id: input.listingId, deletedAt: null },
  });

  if (!listing) {
    throw new AppError(404, 'Listing not found');
  }

  let buyerId: string;
  let sellerId: string;

  if (userId === listing.sellerId) {
    if (!input.buyerId) {
      throw new AppError(400, 'buyerId is required when the seller starts a chat');
    }
    buyerId = input.buyerId;
    sellerId = listing.sellerId;
  } else {
    buyerId = userId;
    sellerId = listing.sellerId;
  }

  if (buyerId === sellerId) {
    throw new AppError(400, 'Buyer and seller must be different users');
  }

  if (input.transactionId) {
    const transaction = await prisma.transaction.findFirst({
      where: {
        id: input.transactionId,
        listingId: listing.id,
        buyerId,
        sellerId,
      },
    });

    if (!transaction) {
      throw new AppError(404, 'Transaction not found for this listing and participants');
    }
  }

  const chat = await prisma.$transaction(async (tx) => {
    const existing = await tx.chat.findUnique({
      where: {
        buyerId_sellerId_listingId: {
          buyerId,
          sellerId,
          listingId: listing.id,
        },
      },
      include: chatInclude,
    });

    if (existing) {
      if (input.transactionId && !existing.transactionId) {
        return tx.chat.update({
          where: { id: existing.id },
          data: { transactionId: input.transactionId },
          include: chatInclude,
        });
      }

      return existing;
    }

    const created = await tx.chat.create({
      data: {
        buyerId,
        sellerId,
        listingId: listing.id,
        transactionId: input.transactionId,
      },
      include: chatInclude,
    });

    if (input.initialMessage) {
      const now = new Date();
      await tx.message.create({
        data: {
          chatId: created.id,
          senderId: userId,
          content: input.initialMessage,
          type: 'TEXT',
        },
      });
      await tx.chat.update({
        where: { id: created.id },
        data: { lastMessageAt: now },
      });
    }

    return tx.chat.findUniqueOrThrow({
      where: { id: created.id },
      include: chatInclude,
    });
  });

  return serializeChat(chat, userId);
};

export const listMyChats = async (
  userId: string,
  query: { page: number; limit: number },
) => {
  const where: Prisma.ChatWhereInput = {
    OR: [{ buyerId: userId }, { sellerId: userId }],
  };

  const [chats, total] = await Promise.all([
    prisma.chat.findMany({
      where,
      include: chatInclude,
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.chat.count({ where }),
  ]);

  const items = await Promise.all(chats.map((chat) => serializeChat(chat, userId)));

  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

export const getChatById = async (id: string, user: User) => {
  const chat = await prisma.chat.findUnique({
    where: { id },
    include: chatInclude,
  });

  if (!chat) {
    throw new AppError(404, 'Chat not found');
  }

  assertChatParticipant(chat, user);
  return serializeChat(chat, user.id);
};

export const listMessages = async (
  chatId: string,
  user: User,
  query: { page: number; limit: number; since?: Date },
) => {
  const chat = await prisma.chat.findUnique({ where: { id: chatId } });

  if (!chat) {
    throw new AppError(404, 'Chat not found');
  }

  assertChatParticipant(chat, user);

  const where: Prisma.MessageWhereInput = {
    chatId,
    isDeleted: false,
    ...(query.since && { createdAt: { gt: query.since } }),
  };

  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where,
      include: messageInclude,
      orderBy: { createdAt: query.since ? 'asc' : 'desc' },
      skip: query.since ? 0 : (query.page - 1) * query.limit,
      take: query.since ? query.limit : query.limit,
    }),
    prisma.message.count({ where }),
  ]);

  const ordered = query.since ? messages : [...messages].reverse();

  return {
    items: ordered,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
    polledSince: query.since ?? null,
  };
};

export const sendMessage = async (
  chatId: string,
  user: User,
  input: { content: string; type: MessageType },
) => {
  const chat = await prisma.chat.findUnique({ where: { id: chatId } });

  if (!chat) {
    throw new AppError(404, 'Chat not found');
  }

  assertChatParticipant(chat, user);

  const now = new Date();

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        chatId,
        senderId: user.id,
        content: input.content,
        type: input.type,
      },
      include: messageInclude,
    });

    await tx.chat.update({
      where: { id: chatId },
      data: { lastMessageAt: now },
    });

    const recipientId = chat.buyerId === user.id ? chat.sellerId : chat.buyerId;
    const senderName = `${user.firstName} ${user.lastName}`.trim();

    await notifyNewMessage(
      {
        recipientId,
        chatId,
        messageId: created.id,
        senderName,
        preview: input.type === 'IMAGE' ? 'Sent an image' : input.content,
        listingId: chat.listingId,
      },
      tx,
    );

    return created;
  });

  return message;
};

export const markChatAsRead = async (chatId: string, user: User) => {
  const chat = await prisma.chat.findUnique({ where: { id: chatId } });

  if (!chat) {
    throw new AppError(404, 'Chat not found');
  }

  assertChatParticipant(chat, user);

  const now = new Date();
  const otherParticipantId = getOtherParticipantId(chat, user.id);

  const result = await prisma.message.updateMany({
    where: {
      chatId,
      senderId: otherParticipantId,
      readAt: null,
      isDeleted: false,
    },
    data: { readAt: now },
  });

  return { chatId, markedRead: result.count, readAt: now };
};

export const markMessageAsRead = async (chatId: string, messageId: string, user: User) => {
  const chat = await prisma.chat.findUnique({ where: { id: chatId } });

  if (!chat) {
    throw new AppError(404, 'Chat not found');
  }

  assertChatParticipant(chat, user);

  const message = await prisma.message.findFirst({
    where: { id: messageId, chatId, isDeleted: false },
  });

  if (!message) {
    throw new AppError(404, 'Message not found');
  }

  if (message.senderId === user.id) {
    throw new AppError(400, 'You cannot mark your own message as read');
  }

  if (message.readAt) {
    return message;
  }

  return prisma.message.update({
    where: { id: messageId },
    data: { readAt: new Date() },
    include: messageInclude,
  });
};

export const getUnreadCount = async (userId: string) => {
  const count = await prisma.message.count({
    where: {
      readAt: null,
      isDeleted: false,
      senderId: { not: userId },
      chat: {
        OR: [{ buyerId: userId }, { sellerId: userId }],
      },
    },
  });

  return { unreadCount: count };
};
