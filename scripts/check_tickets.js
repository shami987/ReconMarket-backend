const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const count = await prisma.supportTicket.count();
  console.log('SUPPORT_TICKET_COUNT=' + count);
  const tickets = await prisma.supportTicket.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log(JSON.stringify(tickets.map(t => ({
    id: t.id, userId: t.userId, subject: t.subject, status: t.status, createdAt: t.createdAt,
  })), null, 2));
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true, email: true, firstName: true, lastName: true } });
  console.log('ADMINS=' + JSON.stringify(admins));
})().finally(() => prisma.$disconnect());