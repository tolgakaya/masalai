/**
 * @masalai/providers — adapter interfaces for the external AI/ops vendors.
 *
 * Vendor SDKs (openai, @anthropic-ai/sdk, elevenlabs, replicate, @fal-ai/client,
 * @google/generative-ai, stripe, @aws-sdk/client-s3, …) live ONLY in this
 * package — a Biome `noRestrictedImports` rule + a dependency-cruiser rule block
 * them anywhere else (engineering-handbook §3.1). May import @masalai/shared.
 *
 * S0 defines the adapter *shapes* so the dependency direction and vendor
 * containment are established. The full method contracts (typed against the
 * story/character schemas) are fleshed out with the pipeline stages in Stream A
 * (issue #2); concrete vendor implementations live under `src/<vendor>/`.
 */

/** Provider selection is config-driven; every adapter identifies itself. */
export interface Provider {
  readonly name: string;
}

/** Story text generation (outline pass + prose pass). */
export interface TextProvider extends Provider {
  generateText(prompt: string): Promise<string>;
}

/** Illustration generation with reference-image conditioning. */
export interface ImageProvider extends Provider {
  generateImage(prompt: string, references: readonly Uint8Array[]): Promise<Uint8Array>;
}

/** Narration / text-to-speech. */
export interface TTSProvider extends Provider {
  synthesize(text: string, voiceId: string): Promise<Uint8Array>;
}

/** Result of a moderation scan; `passed=false` carries a machine-readable reason. */
export interface ModerationResult {
  readonly passed: boolean;
  readonly reason?: string;
}

/** Safety moderation for user uploads and generated output. */
export interface ModerationProvider extends Provider {
  moderateImage(bytes: Uint8Array, mime: string): Promise<ModerationResult>;
  moderateText(text: string): Promise<ModerationResult>;
}
