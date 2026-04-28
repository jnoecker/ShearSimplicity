// Seeds the dev fixture that DevAuthProvider returns.
// Identity values come from .env so the seed and the auth provider agree.

import { PrismaClient, Role, MembershipStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const userId = required("DEV_USER_ID");
  const userEmail = required("DEV_USER_EMAIL");
  const salonId = required("DEV_SALON_ID");
  const salonSlug = required("DEV_SALON_SLUG");

  const user = await prisma.user.upsert({
    where: { id: userId },
    update: { email: userEmail, displayName: "Dev User" },
    create: { id: userId, email: userEmail, displayName: "Dev User" },
  });

  const salon = await prisma.salon.upsert({
    where: { id: salonId },
    update: { slug: salonSlug, name: "Acme Salon (dev)" },
    create: {
      id: salonId,
      slug: salonSlug,
      name: "Acme Salon (dev)",
      timezone: "America/New_York",
    },
  });

  await prisma.salonMembership.upsert({
    where: { salonId_userId: { salonId: salon.id, userId: user.id } },
    update: { role: Role.OWNER, status: MembershipStatus.ACTIVE },
    create: {
      salonId: salon.id,
      userId: user.id,
      role: Role.OWNER,
      status: MembershipStatus.ACTIVE,
    },
  });

  // eslint-disable-next-line no-console
  console.log(
    `Seeded dev fixture: user=${user.id} salon=${salon.id} (${salon.slug})`,
  );
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing env var ${name}. Copy .env.example to .env at the repo root.`,
    );
  }
  return value;
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
