import config from "./app/config";
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "./app/helpers/hashPassword";

const prisma = new PrismaClient();

export const seedSuperAdmin = async () => {
  const email = config.superAdmin.email as string;
  const password = config.superAdmin.password as string;

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    // console.log("⚠️  Super Admin already exists!");
    return;
  }

  const hashedPassword = await hashPassword(password);

  await prisma.user.create({
    data: {
      name: "Super Admin",
      email,
      password: hashedPassword,
      role: Role.super_admin,
    },
  });

  console.log("✅ Super Admin seeded successfully.");
};
