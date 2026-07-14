import type { Asset } from '@prisma/client';
import { prisma } from '../client.js';

/** userId-first, IDOR-safe asset repository (engineering-handbook §7). */
export function findAssetById(userId: string, id: string): Promise<Asset | null> {
  return prisma.asset.findFirst({ where: { id, userId } });
}

export function listAssetsByUser(userId: string): Promise<Asset[]> {
  return prisma.asset.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
}
