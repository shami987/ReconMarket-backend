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
    email: 'admin@gmail.com',
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
  console.log('  admin@gmail.com             — ADMIN');
  console.log('  buyer@reconmarket.dev       — USER, can buy only');
  console.log('  individual@reconmarket.dev  — USER, verified individual seller');
  console.log('  business@reconmarket.dev    — USER, verified business seller');
  console.log('  pending@reconmarket.dev     — USER, pending seller verification');
  console.log('');

  await seedCategoriesAndListings();
}

const SEED_CATEGORIES = [
  {
    name: 'Steel & Metal',
    slug: 'steel-metal',
    sortOrder: 1,
    children: [
      { name: 'Steel Rods', slug: 'steel-rods', sortOrder: 1 },
      { name: 'Steel Sheets', slug: 'steel-sheets', sortOrder: 2 },
      { name: 'Iron Bars', slug: 'iron-bars', sortOrder: 3 },
    ],
  },
  {
    name: 'Cement & Concrete',
    slug: 'cement-concrete',
    sortOrder: 2,
    children: [
      { name: 'Portland Cement', slug: 'portland-cement', sortOrder: 1 },
      { name: 'Ready Mix Concrete', slug: 'ready-mix', sortOrder: 2 },
      { name: 'Blocks & Bricks', slug: 'blocks-bricks', sortOrder: 3 },
    ],
  },
  {
    name: 'Wood & Timber',
    slug: 'wood-timber',
    sortOrder: 3,
    children: [
      { name: 'Plywood', slug: 'plywood', sortOrder: 1 },
      { name: 'Hardwood Lumber', slug: 'hardwood-lumber', sortOrder: 2 },
      { name: 'Timber Beams', slug: 'timber-beams', sortOrder: 3 },
    ],
  },
  {
    name: 'Electrical',
    slug: 'electrical',
    sortOrder: 4,
    children: [
      { name: 'Cables & Wiring', slug: 'cables-wiring', sortOrder: 1 },
      { name: 'Switches & Sockets', slug: 'switches-sockets', sortOrder: 2 },
      { name: 'Lighting', slug: 'lighting', sortOrder: 3 },
    ],
  },
  {
    name: 'Roofing',
    slug: 'roofing',
    sortOrder: 5,
    children: [
      { name: 'Roof Sheets', slug: 'roof-sheets', sortOrder: 1 },
      { name: 'Roof Tiles', slug: 'roof-tiles', sortOrder: 2 },
      { name: 'Gutters & Drainage', slug: 'gutters-drainage', sortOrder: 3 },
    ],
  },
  {
    name: 'Tiles & Finishes',
    slug: 'tiles-finishes',
    sortOrder: 6,
    children: [
      { name: 'Floor Tiles', slug: 'floor-tiles', sortOrder: 1 },
      { name: 'Wall Tiles', slug: 'wall-tiles', sortOrder: 2 },
      { name: 'Paint & Coatings', slug: 'paint-coatings', sortOrder: 3 },
    ],
  },
  {
    name: 'Plumbing',
    slug: 'plumbing',
    sortOrder: 7,
    children: [
      { name: 'Pipes & Fittings', slug: 'pipes-fittings', sortOrder: 1 },
      { name: 'Taps & Faucets', slug: 'taps-faucets', sortOrder: 2 },
      { name: 'Water Tanks', slug: 'water-tanks', sortOrder: 3 },
    ],
  },
] as const;

async function upsertCategory(
  category: { name: string; slug: string; sortOrder: number; parentId?: string },
) {
  return prisma.category.upsert({
    where: { slug: category.slug },
    update: {
      name: category.name,
      sortOrder: category.sortOrder,
      parentId: category.parentId ?? null,
      isActive: true,
    },
    create: {
      name: category.name,
      slug: category.slug,
      sortOrder: category.sortOrder,
      parentId: category.parentId,
    },
  });
}

async function seedCategoriesAndListings() {
  console.log('Seeding categories, subcategories, and sample listings...\n');

  let parentCount = 0;
  let subcategoryCount = 0;

  for (const parent of SEED_CATEGORIES) {
    const parentRecord = await upsertCategory({
      name: parent.name,
      slug: parent.slug,
      sortOrder: parent.sortOrder,
    });
    parentCount += 1;

    for (const child of parent.children) {
      await upsertCategory({
        name: child.name,
        slug: child.slug,
        sortOrder: child.sortOrder,
        parentId: parentRecord.id,
      });
      subcategoryCount += 1;
    }
  }

  const individualSeller = await prisma.user.findUnique({
    where: { email: 'individual@reconmarket.dev' },
  });
  const businessSeller = await prisma.user.findUnique({
    where: { email: 'business@reconmarket.dev' },
  });

  if (!individualSeller || !businessSeller) {
    return;
  }

  const steelRods = await prisma.category.findUnique({ where: { slug: 'steel-rods' } });
  const portlandCement = await prisma.category.findUnique({ where: { slug: 'portland-cement' } });

  if (!steelRods || !portlandCement) {
    return;
  }

  const sampleListings = [
    {
      sellerId: individualSeller.id,
      categoryId: steelRods.id,
      title: 'Steel Rods (8mm)',
      description: 'High quality steel rods ready for verified pickup in Kigali.',
      price: 15000,
      currency: 'RWF',
      condition: 'NEW' as const,
      city: 'Kigali',
      country: 'Rwanda',
      status: 'ACTIVE' as const,
      publishedAt: new Date(),
      images: [
        {
          url: 'https://storage.reconmarket.dev/seeds/steel-rods.jpg',
          altText: 'Steel rods bundle',
          sortOrder: 0,
          isPrimary: true,
        },
      ],
    },
    {
      sellerId: businessSeller.id,
      categoryId: portlandCement.id,
      title: 'Portland Cement (50kg)',
      description: 'Premium cement bags suitable for construction projects across Rwanda.',
      price: 12000,
      currency: 'RWF',
      condition: 'NEW' as const,
      city: 'Kigali',
      country: 'Rwanda',
      status: 'ACTIVE' as const,
      publishedAt: new Date(),
      images: [
        {
          url: 'https://storage.reconmarket.dev/seeds/cement-bags.jpg',
          altText: 'Cement bags',
          sortOrder: 0,
          isPrimary: true,
        },
      ],
    },
  ];

  for (const listing of sampleListings) {
    const existing = await prisma.listing.findFirst({
      where: {
        sellerId: listing.sellerId,
        title: listing.title,
        deletedAt: null,
      },
    });

    if (existing) {
      continue;
    }

    const { images, ...data } = listing;
    await prisma.listing.create({
      data: {
        ...data,
        images: { create: images },
      },
    });
  }

  console.log(`  Parent categories seeded: ${parentCount}`);
  console.log(`  Subcategories seeded: ${subcategoryCount}`);
  console.log('  Sample listings linked to subcategories (steel-rods, portland-cement)');
  console.log('');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
