import { PrismaClient } from '@prisma/client';

/**
 * One PrismaClient per process. Cached on globalThis in non-production so dev
 * hot-reload doesn't open a new connection pool on every module re-evaluation
 * (standard Prisma pattern). Internal to @masalai/db — apps must go through the
 * repositories, never touch this client directly (engineering-handbook §7).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
