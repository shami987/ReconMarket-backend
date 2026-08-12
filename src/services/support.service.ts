import { SupportTicketStatus } from '@prisma/client';
import { AppError } from '../errors/AppError';
import { prisma } from '../lib/prisma';

export type CreateSupportTicketInput = {
  userId: string;
  subject: string;
  message: string;
};

export type ListSupportTicketsInput = {
  page: number;
  limit: number;
  status?: SupportTicketStatus;
};

export const createSupportTicket = async (input: CreateSupportTicketInput) => {
  return prisma.supportTicket.create({
    data: {
      userId: input.userId,
      subject: input.subject,
      message: input.message,
      status: 'OPEN',
    },
  });
};

export const listMySupportTickets = async (
  userId: string,
  query: ListSupportTicketsInput,
) => {
  const where = {
    userId,
    ...(query.status && { status: query.status }),
  };

  const [tickets, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.supportTicket.count({ where }),
  ]);

  return {
    tickets,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

export const getSupportTicket = async (id: string, userId: string) => {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id, userId },
  });

  if (!ticket) {
    throw new AppError(404, 'Support ticket not found');
  }

  return ticket;
};

export const listAllSupportTickets = async (
  query: ListSupportTicketsInput,
) => {
  const where = {
    ...(query.status && { status: query.status }),
  };

  const [tickets, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
        },
        repliedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.supportTicket.count({ where }),
  ]);

  return {
    tickets,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

export const replyToSupportTicket = async (
  id: string,
  adminId: string,
  input: { reply: string; status?: SupportTicketStatus },
) => {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
  });

  if (!ticket) {
    throw new AppError(404, 'Support ticket not found');
  }

  return prisma.supportTicket.update({
    where: { id },
    data: {
      reply: input.reply,
      repliedById: adminId,
      repliedAt: new Date(),
      status: input.status ?? 'RESOLVED',
    },
  });
};

export const getOpenSupportTicketCount = async () => {
  const count = await prisma.supportTicket.count({
    where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
  });
  return { count };
};