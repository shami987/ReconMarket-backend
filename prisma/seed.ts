import { PrismaClient, UserRole, VerificationType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEV_PASSWORD = process.env.DEV_SEED_PASSWORD ?? 'Password123!';

type SeedUser = {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: UserRole;
  verificationType: VerificationType;
  verification?: {
    requestedType: 'INDIVIDUAL_SELLER' | 'BUSINESS_SELLER';
    documentUrl: string;
    businessName?: string;
    status: 'PENDING' | 'APPROVED';
  };
};

const DEV_USERS: SeedUser[] = [
  {
    email: 'admin@reconmarket.dev',
    firstName: 'Admin',
    lastName: 'User',
    role: 'ADMIN',
    verificationType: 'NONE',
  },
  {
    email: 'buyer@reconmarket.dev',
    firstName: 'Buyer',
    lastName: 'User',
    phone: '+250788000001',
    role: 'USER',
    verificationType: 'NONE',
  },
  {
    email: 'individual@reconmarket.dev',
    firstName: 'Individual',
    lastName: 'Seller',
    phone: '+250788000002',
    role: 'USER',
    verificationType: 'INDIVIDUAL_SELLER',
    verification: {
      requestedType: 'INDIVIDUAL_SELLER',
      documentUrl: 'https://storage.reconmarket.dev/seeds/individual-id.pdf',
      status: 'APPROVED',
    },
  },
  {
    email: 'business@reconmarket.dev',
    firstName: 'Business',
    lastName: 'Seller',
    phone: '+250788000003',
    role: 'USER',
    verificationType: 'BUSINESS_SELLER',
    verification: {
      requestedType: 'BUSINESS_SELLER',
      documentUrl: 'https://storage.reconmarket.dev/seeds/rdb-certificate.pdf',
      businessName: 'ReconMarket Trading Ltd',
      status: 'APPROVED',
    },
  },
  {
    email: 'pending@reconmarket.dev',
    firstName: 'Pending',
    lastName: 'Seller',
    role: 'USER',
    verificationType: 'NONE',
    verification: {
      requestedType: 'INDIVIDUAL_SELLER',
      documentUrl: 'https://storage.reconmarket.dev/seeds/pending-id.pdf',
      status: 'PENDING',
    },
  },
];

async function seedUser(adminId: string | null, user: SeedUser) {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12);

  const record = await prisma.user.upsert({
    where: { email: user.email },
    update: {
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      passwordHash,
      role: user.role,
      verificationType: user.verificationType,
      isEmailVerified: true,
      isActive: true,
      deletedAt: null,
    },
    create: {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      passwordHash,
      role: user.role,
      verificationType: user.verificationType,
      isEmailVerified: true,
      isActive: true,
    },
  });

  if (user.verification) {
    const existing = await prisma.sellerVerification.findFirst({
      where: {
        userId: record.id,
        requestedType: user.verification.requestedType,
        status: user.verification.status,
      },
    });

    if (!existing) {
      await prisma.sellerVerification.create({
        data: {
          userId: record.id,
          requestedType: user.verification.requestedType,
          documentUrl: user.verification.documentUrl,
          businessName: user.verification.businessName,
          status: user.verification.status,
          reviewedById:
            user.verification.status === 'APPROVED' ? adminId : undefined,
          reviewedAt: user.verification.status === 'APPROVED' ? new Date() : undefined,
        },
      });
    }
  }

  return record;
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
    throw new Error(
      'Refusing to seed in production. Set ALLOW_PRODUCTION_SEED=true to override.',
    );
  }

  console.log('Seeding development users...\n');

  const admin = await seedUser(null, DEV_USERS[0]);

  for (const user of DEV_USERS.slice(1)) {
    await seedUser(admin.id, user);
  }

  console.log('Development users ready:\n');
  console.log('  Password (all accounts):', DEV_PASSWORD);
  console.log('');
  console.log('  admin@reconmarket.dev       — ADMIN');
  console.log('  buyer@reconmarket.dev       — USER, can buy only');
  console.log('  individual@reconmarket.dev  — USER, verified individual seller');
  console.log('  business@reconmarket.dev    — USER, verified business seller');
  console.log('  pending@reconmarket.dev     — USER, pending seller verification');
  console.log('');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
