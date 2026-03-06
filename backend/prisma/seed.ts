import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.equipment.upsert({
    where: { id: 'seed-eq-001' },
    update: {},
    create: {
      id: 'seed-eq-001',
      name: 'Main Transformer T1'
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
