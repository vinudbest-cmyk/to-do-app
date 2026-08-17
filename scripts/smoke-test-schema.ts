import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const user = await prisma.user.create({
    data: { email: "smoke-test@example.com", name: "Smoke Test" },
  });
  console.log("Created user:", user.id);

  const list = await prisma.list.create({
    data: { title: "Smoke Test List", createdBy: user.id },
  });
  console.log("Created list:", list.id);

  const membership = await prisma.listMember.create({
    data: { listId: list.id, userId: user.id },
  });
  console.log("Created membership:", membership.id);

  const item = await prisma.item.create({
    data: { listId: list.id, text: "Buy milk", reminderAt: new Date() },
  });
  console.log("Created item:", item.id);

  const listWithRelations = await prisma.list.findUniqueOrThrow({
    where: { id: list.id },
    include: { members: true, items: true, creator: true },
  });

  if (listWithRelations.members.length !== 1) {
    throw new Error(
      `Expected 1 member, got ${listWithRelations.members.length}`
    );
  }
  if (listWithRelations.items.length !== 1) {
    throw new Error(
      `Expected 1 item, got ${listWithRelations.items.length}`
    );
  }
  if (listWithRelations.creator.id !== user.id) {
    throw new Error("List creator relation did not resolve correctly");
  }
  console.log("Relations verified: 1 member, 1 item, creator resolved.");

  await prisma.item.delete({ where: { id: item.id } });
  await prisma.listMember.delete({ where: { id: membership.id } });
  await prisma.list.delete({ where: { id: list.id } });
  await prisma.user.delete({ where: { id: user.id } });
  console.log("Cleanup complete. Schema smoke test PASSED.");
}

main()
  .catch((err) => {
    console.error("Schema smoke test FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
