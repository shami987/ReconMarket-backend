import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function backfillSlugs() {
  const listings = await prisma.listing.findMany({
    where: { deletedAt: null, slug: '' },
    select: { id: true, title: true },
  });

  console.log(`Found ${listings.length} listings to backfill`);

  for (const listing of listings) {
    const base = slugify(listing.title);
    let slug = base;
    let counter = 2;

    while (true) {
      const existing = await prisma.listing.findFirst({
        where: { slug, deletedAt: null, id: { not: listing.id } },
        select: { id: true },
      });
      if (!existing) break;
      slug = `${base}-${counter}`;
      counter++;
    }

    await prisma.listing.update({
      where: { id: listing.id },
      data: { slug },
    });

    console.log(`  ${listing.title} -> ${slug}`);
  }

  console.log('Done!');
  await prisma.$disconnect();
}

backfillSlugs().catch((e) => {
  console.error(e);
  process.exit(1);
});
