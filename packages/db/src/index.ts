/**
 * @masalai/db — Prisma schema, client, and userId-first repositories. Apps import
 * repositories from here and never touch Prisma directly (engineering-handbook §7).
 * May depend on @masalai/shared; nothing else internal (§3.1).
 */

export type {
  Asset,
  AuditLog,
  Character,
  CreditLedgerEntry,
  Job,
  Story,
  StoryCharacter,
  StoryPage,
  Subscription,
  User,
} from '@prisma/client';
// Domain enums (runtime values apps switch on) + model types, re-exported so
// consumers depend on @masalai/db, not @prisma/client directly.
export {
  AssetKind,
  CharacterStatus,
  CharacterType,
  CreditReason,
  JobStage,
  JobStatus,
  ModerationStatus,
  StoryStatus,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
// Repositories (the public data-access surface).
export { findAssetById, listAssetsByUser } from './repositories/asset.repository.js';
export {
  type CreateCharacterInput,
  createCharacter,
  findCharacterById,
  listCharactersByUser,
} from './repositories/character.repository.js';
export {
  findHealthJobById,
  type HealthJobRecord,
  upsertHealthJob,
} from './repositories/health-job.repository.js';
export {
  type CreateStoryInput,
  createStory,
  findStoryById,
  listStoriesByUser,
} from './repositories/story.repository.js';
