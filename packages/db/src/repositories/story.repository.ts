import type { Story } from '@prisma/client';
import { prisma } from '../client.js';

export interface CreateStoryInput {
  readonly topic: string;
  readonly moral: string;
  /** Style-preset slug from the providers styles registry (not an enum). */
  readonly artStyle: string;
  readonly language?: string;
  readonly title?: string;
  readonly voiceId?: string;
}

/** userId-first, IDOR-safe story repository (engineering-handbook §7). */
export function createStory(userId: string, input: CreateStoryInput): Promise<Story> {
  return prisma.story.create({
    data: {
      userId,
      topic: input.topic,
      moral: input.moral,
      artStyle: input.artStyle,
      ...(input.language === undefined ? {} : { language: input.language }),
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.voiceId === undefined ? {} : { voiceId: input.voiceId }),
    },
  });
}

export function findStoryById(userId: string, id: string): Promise<Story | null> {
  return prisma.story.findFirst({ where: { id, userId } });
}

export function listStoriesByUser(userId: string): Promise<Story[]> {
  return prisma.story.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
}
