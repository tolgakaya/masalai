import type { Character, CharacterType } from '@prisma/client';
import { prisma } from '../client.js';

export interface CreateCharacterInput {
  readonly name: string;
  readonly type: CharacterType;
  /** Style-preset slug from the providers styles registry (not an enum). */
  readonly artStyle: string;
  readonly age?: number;
}

/**
 * All character reads/writes are scoped by `userId` (first argument) so tenancy
 * is enforced by the signature, not by memory (engineering-handbook §7). Reads
 * use `findFirst({ id, userId })` — never `findUnique({ id })` — so one user can
 * never fetch another user's row (IDOR).
 */
export function createCharacter(userId: string, input: CreateCharacterInput): Promise<Character> {
  return prisma.character.create({
    data: {
      userId,
      name: input.name,
      type: input.type,
      artStyle: input.artStyle,
      ...(input.age === undefined ? {} : { age: input.age }),
    },
  });
}

export function findCharacterById(userId: string, id: string): Promise<Character | null> {
  return prisma.character.findFirst({ where: { id, userId } });
}

export function listCharactersByUser(userId: string): Promise<Character[]> {
  return prisma.character.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
}
