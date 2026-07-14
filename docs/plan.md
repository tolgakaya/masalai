# MasalAI — Personalized AI Storybook SaaS
## Full Technical, Security & Business Plan

> Purpose of this document: complete blueprint to hand to Claude Code for implementation.
> Product: users upload a photo of their child (or any character reference), pick a story topic and a moral ("kıssadan hisse"), and the platform asynchronously generates a **10-page illustrated, narrated fairy tale** — an audio storybook.

---

## 1. Product Overview

### 1.1 Core value proposition
- Every child becomes the hero of their own fairy tale — their **actual likeness**, illustrated consistently across 10 pages.
- Parents control the **topic** and the **moral/message** of the story (kindness, sharing, brushing teeth, overcoming fear, etc.).
- Delivered as an **audio storybook**: page-by-page illustrations + professional TTS narration, playable like a bedtime story.
- Fully asynchronous: user submits the request, the story is generated in the background (2–6 min), user is notified when ready.

### 1.2 Target users
- Primary: parents of children aged 2–10 (account holders are always adults, 18+).
- Secondary: grandparents/relatives (gifting), kindergartens & preschools (B2B licensing, later phase), speech/behavioral therapists (custom moral stories).

### 1.3 Key differentiators vs. competitors (Oscar Stories, Bedtimestory.ai, Childbook.ai, Wonderbly)
1. Photo-based **character consistency** across all pages (most competitors use generic avatars or inconsistent AI art).
2. **Turkish-first** high-quality narration + multilingual support.
3. Explicit **moral engineering**: the lesson is a first-class input, woven into plot structure.
4. Audio-book playback experience (auto page-turn synced to narration), not just a PDF.

---

## 2. Feature Plan

### 2.1 MVP (Phase 1) — "one perfect story"
> Scope note: "MVP" = everything in this table, delivered across milestones **M1–M2** (§17). The table defines the launch bar; the milestone plan defines the order (e.g. exports and the free tier land in M2).
| Feature | Detail |
|---|---|
| Auth | Email/password + Google OAuth. 18+ confirmation at signup. |
| Character creation | Upload 1–3 photos per character; name, age, gender, relationship (child/sibling/pet/custom). Photo is converted to a reusable **character profile** (stylized character sheet). |
| Story request form | Topic (free text + suggested templates), moral/lesson (free text + curated list), art style (3–5 presets: watercolor, pixar-like 3D, flat cartoon, storybook classic), language (TR/EN), narrator voice (2–3 options). |
| Async generation | Job queued; progress states visible (Queued → Writing → Illustrating 3/10 → Narrating → Ready). Email + in-app notification on completion. |
| Storybook player | Web player: page image + text + audio, auto-advance synced to narration, manual page flip, read-along text highlighting (v1.1). |
| Library | "My Stories" list, re-play, re-download. |
| Export | MP4 video export (pages + narration) and PDF export. |
| Free tier | 1 free story (watermarked), then paid. |

### 2.2 Phase 2 — monetization & retention
- Credit packs + subscription tiers (see Business section).
- Multiple characters per story (child + sibling + pet).
- Character library: saved characters reused across stories without re-upload.
- Story series: same character, episodic stories ("Ali'nin Orman Maceraları — Bölüm 3").
- Share links (privacy-controlled, expiring), gift a story.
- Voice cloning upsell: parent narrates in their **own cloned voice** (strong consent flow required).
- Regeneration controls: regenerate a single page's image or the whole story (limited retries included in price).

### 2.3 Phase 3 — expansion
- Mobile apps (React Native / Expo) with offline playback.
- Print-on-demand hardcover via Gelato/Printful API.
- B2B portal for kindergartens (bulk characters, classroom stories).
- Marketplace of story templates by children's authors (rev-share).
- Additional languages (AR, DE — large TR diaspora markets).

### 2.4 Explicitly out of scope (MVP)
- Real-time/streaming generation, in-browser image editing, user-to-user social features, Android/iOS native apps.

---

## 3. User Flows

### 3.1 Happy path
1. Sign up → verify email → consent screen (ToS + KVKK/GDPR explicit consent for child photo processing — separate checkbox, not bundled).
2. Create character: upload photo(s) → automatic moderation scan → cropping/face-detect assist → pick art style → system generates a **character sheet** (front/side/expression reference in chosen style) → user approves the likeness or regenerates (2 free regens).
3. New story: pick character(s) → topic → moral → length fixed at 10 pages (MVP) → voice → submit.
4. Job runs async. Progress page + email when ready.
5. Player opens → parent and child listen/read → export/share.

### 3.2 Failure paths (must be designed, not an afterthought)
- Moderation rejection (photo or topic): clear, kind error; no credit consumed.
- Generation failure mid-pipeline: automatic retry (max 2); if still failing, credit refunded automatically + apology email.
- Likeness dissatisfaction: page-level regeneration (N free per story), then paid.
- Payment failure / webhook lag: credits granted idempotently via Stripe webhook with event dedup.

---
## 4. System Architecture

### 4.1 High-level topology (Railway)

```
                        ┌──────────────────────────────┐
                        │        Cloudflare (DNS,      │
                        │   CDN, WAF, rate limiting)   │
                        └──────────────┬───────────────┘
                                       │
              ┌────────────────────────┼─────────────────────────┐
              │                        │                         │
     ┌────────▼────────┐     ┌─────────▼─────────┐               │
     │  web (Next.js)  │     │   api (Fastify/   │               │
     │  Railway svc    │────▶│   NestJS, TS)     │               │
     └─────────────────┘     │   Railway svc     │               │
                             └───┬─────┬─────┬───┘               │
                                 │     │     │                   │
                    ┌────────────▼┐ ┌──▼───┐ ┌▼──────────────┐   │
                    │ Postgres    │ │Redis │ │ Cloudflare R2 │◀──┘
                    │ (Railway)   │ │(Rail)│ │ (S3-compat,   │  signed
                    └─────────────┘ └──┬───┘ │ private bkts) │  URLs
                                       │     └───────▲───────┘
                             ┌─────────▼─────────┐   │
                             │  worker (BullMQ   │───┘
                             │  consumers, TS)   │──▶ external AI APIs:
                             │  Railway svc,     │    LLM (story), Image gen,
                             │  N replicas       │    TTS, Moderation
                             └───────────────────┘
```

### 4.2 Services (each = one Railway service, one Dockerfile)
1. **web** — Next.js 15 (App Router). Marketing pages, app UI, storybook player. Talks only to `api`.
2. **api** — Fastify (or NestJS) REST API. Auth, CRUD, job submission, signed-URL issuing, Stripe webhooks. Stateless → horizontally scalable.
3. **worker** — BullMQ consumers. Runs the AI pipeline. Stateless, scale by replica count. Separate queues per stage so slow stages don't starve fast ones.
4. **Postgres** — Railway managed. Single source of truth.
5. **Redis** — Railway managed. BullMQ queues + rate limiting + short-lived cache.
6. **Cloudflare R2** — all binary assets (uploads, character sheets, page images, audio, exports). Private buckets, presigned URLs only. Zero egress fees matter here (audio/video delivery). Railway volumes are NOT used for user data.

### 4.3 Why this shape
- Single language (TypeScript) end-to-end → maximum Claude Code velocity, shared types between api/worker/web via monorepo packages.
- API vs worker separation is the core scalability primitive: bursty generation load never affects interactive latency.
- Everything stateless except managed stores → Railway replica scaling is trivial.

### 4.4 Async pipeline (the heart of the product)
> Provider-limit behavior, multi-provider failover/recovery, and scale mechanics are governed by **docs/ai-provider-scale-architecture.md** (normative for this section and §6).

Queues (BullMQ): `story.plan` → `story.illustrate` (fan-out per page) → `story.narrate` → `story.assemble`

**Stage 0 — Moderation gate (sync-ish, at upload & submit time)**
- Photo upload: CSAM/NSFW scan (Hive AI or AWS Rekognition moderation labels) + face detection sanity check. Reject before storage is finalized.
- Topic/moral text: LLM-based moderation + provider moderation endpoint. Block violence/adult/ideological content; this is a children's product — be strict.

**Stage 1 — Character sheet (once per character, cached & reused)**
- Input: user photo(s) + chosen art style.
- Output: 1–3 reference images of the character in target style (neutral pose, expressions) stored in R2.
- Model options (build behind a `ImageProvider` adapter interface — providers WILL change):
  - Gemini image model (nano-banana class) with reference-image conditioning — currently best consistency/price.
  - gpt-image-1 with reference input.
  - Flux + PuLID/IP-Adapter via fal.ai or Replicate (more control, more ops).
- The original photo is used ONLY at this stage. Downstream stages use the stylized character sheet — this is both a consistency technique and a major privacy win (see Security).

**Stage 2 — Story writing (LLM)**
- One structured LLM call → strict JSON: title, 10 pages, each page = { narrative_text (40–70 words), illustration_prompt, characters_present, emotion }, plus moral integration in final 2 pages, age-appropriate vocabulary by target age.
- Guardrails: system prompt forbids scary/violent/branded content; output passed through moderation; JSON schema-validated (zod), retry on invalid.
- Model: any strong LLM (Claude Sonnet via API is a natural fit); keep behind `TextProvider` adapter.

**Stage 3 — Illustration (fan-out, 10 pages + cover = 11 jobs)**
- Each page job: character sheet refs + page illustration_prompt + global style token → image → output moderation scan → R2.
- Pages run in parallel (concurrency-limited per provider rate limits). Per-page retry with prompt perturbation on failure.
- Seed/style consistency: fixed style descriptor + same character refs on every call.

**Stage 4 — Narration (TTS)**
- Full text (or per-page) → TTS. Providers: ElevenLabs (best TR quality, per-char pricing), OpenAI TTS (cheap), Google WaveNet (fallback). `TTSProvider` adapter.
- Per-page audio files + word/sentence timestamps (ElevenLabs returns alignment) → enables read-along highlighting and auto page-turn.

**Stage 5 — Assembly**
- Write `story` record complete: manifest JSON (pages, image URLs, audio URLs, timings), generate MP4 export lazily on first request (ffmpeg in worker), thumbnail, notify user (email + in-app).

**Job orchestration rules**
- Every stage idempotent (job id = deterministic key; re-running overwrites same R2 keys).
- Dead-letter queue + alert after final retry.
- One `story_generation` row tracks per-stage status → powers the progress UI (poll or SSE).
- Global + per-user concurrency caps (a user can't queue 50 stories and starve others; also caps blast radius of a stolen account).

### 4.5 Data model (Postgres, Prisma/Drizzle)

```
users(id, email, name, locale, created_at, deleted_at, consent_version, consent_at)
characters(id, user_id, name, age, type, art_style, status, sheet_asset_ids[], created_at, source_photo_deleted_at)
assets(id, user_id, kind[upload|charsheet|page_image|audio|export], r2_key, mime, bytes, moderation_status, created_at, expires_at)
stories(id, user_id, title, topic, moral, language, art_style, voice_id, status, manifest_jsonb, created_at)
story_pages(id, story_id, index, text, illustration_prompt, image_asset_id, audio_asset_id, duration_ms)
jobs(id, story_id, stage, status, attempts, error, started_at, finished_at)   -- mirror of queue state for UI/audit
credits_ledger(id, user_id, delta, reason[purchase|generation|refund|bonus], ref_id, created_at)  -- append-only; balance = SUM
subscriptions(id, user_id, stripe_customer_id, plan, status, period_end)
audit_log(id, user_id, action, entity, meta_jsonb, ip, created_at)
```
Design notes: credits as append-only ledger (never a mutable balance column); soft-delete users with hard-delete cron honoring retention policy; `manifest_jsonb` makes the player independent of joins.

### 4.6 API surface (sketch)
```
POST /auth/*                          (or delegated to Better Auth/Clerk)
POST /characters                      multipart init → presigned R2 upload → finalize
POST /characters/:id/sheet/regenerate
POST /stories                         { character_ids[], topic, moral, style, language, voice }
GET  /stories/:id                     status + manifest
GET  /stories/:id/events              SSE progress
POST /stories/:id/pages/:n/regenerate-image
GET  /assets/:id/url                  short-lived signed URL (never public URLs)
POST /billing/checkout | /billing/webhook (Stripe)
GET  /me/credits
DELETE /me                            full GDPR/KVKK erasure flow
```

### 4.7 Repo & project structure (GitHub)
Single monorepo (recommended for Claude Code): `github.com/<org>/masalai`
```
masalai/
  apps/
    web/        Next.js
    api/        Fastify
    worker/     BullMQ consumers + pipeline
  packages/
    db/         Prisma schema + client
    shared/     zod schemas, types, constants (single source of truth for API contracts)
    providers/  TextProvider, ImageProvider, TTSProvider, ModerationProvider adapters
    ui/         design tokens + component library (contract: docs/ux-design-plan.md §4, §7)
  infra/
    railway/    service configs, Dockerfiles
    github/     CI workflows
  docs/         this plan, ADRs
  CLAUDE.md
```
- Tooling: pnpm workspaces + Turborepo, TypeScript strict, ESLint+Prettier, Vitest, Playwright (player smoke test).
- CI (GitHub Actions): typecheck+lint+test on PR; Railway auto-deploys from `main` per service (watch paths per app); preview environments via Railway PR environments.
- Migrations: run as Railway pre-deploy command (`prisma migrate deploy`).

### 4.8 Environments & config
- `production` + `staging` Railway environments; separate R2 buckets, Stripe test mode in staging.
- All secrets in Railway variables; never in repo. `.env.example` maintained.
- Feature flags: simple DB-backed flags table (avoid a SaaS dependency at MVP).

### 4.9 Observability
- Structured JSON logs (pino) → Railway logs; ship to a Loki instance or Better Stack if retention needed.
- OpenTelemetry traces across api→queue→worker (job id as trace correlation); export to Grafana Cloud free tier or self-hosted Tempo.
- Metrics that matter: queue depth per stage, stage p95 duration, generation success rate, cost per story (log actual provider spend per job!), moderation rejection rate, credit-refund rate.
- Alerts: DLQ > 0, queue depth sustained, success rate < 95%, provider error spikes.
- Sentry on web+api+worker.

---
## 5. Security & Compliance

> This product processes **children's photos**. This is the highest-risk asset class you can hold. Security and privacy are product features here, and a marketing advantage if done visibly well.

### 5.1 Legal / regulatory
- **KVKK (Turkey)**: child photos = personal data of a minor; face imagery may be treated as biometric-adjacent → collect **açık rıza** (explicit, separate, informed consent) from the parent/guardian, versioned and timestamped. VERBİS registration check depending on scale. Data processing inventory + aydınlatma metni from day one.
- **GDPR** (if serving EU): Art. 8 (child data), potentially Art. 9. Lawful basis = explicit consent; DPA with every processor (image/TTS/LLM providers, Cloudflare, Railway, Stripe). Right to erasure must actually work end-to-end (DB + R2 + provider-side deletion where applicable).
- **COPPA (US)**: account holders are adults (18+ attested at signup), the child is a data subject, not a user → keep it that way; do not build child-facing accounts.
- **Provider data terms**: only use AI providers with **no-training-on-API-data** guarantees (verify per provider, per tier); document this in the privacy policy. This is a hard vendor selection criterion.

### 5.2 Photo lifecycle (privacy-by-design)
1. Upload → moderation scan → encrypted at rest in R2 (SSE), private bucket, no public ACLs ever.
2. Used once to build the stylized character sheet.
3. **Original photo auto-deleted after character sheet approval** (default; user may opt to keep for future regens with clear notice). `source_photo_deleted_at` recorded.
4. All downstream generation uses only the stylized sheet — no real face leaves the system again.
5. All asset access via short-lived (≤15 min) presigned URLs bound to the authenticated user.
6. Share links: opt-in, tokenized, expiring, revocable; default is private.
7. Account deletion: hard-delete cascade job (DB rows + all R2 objects + Stripe customer) with completion receipt to the user; verify with an automated test.

### 5.3 Content safety (both directions)
- **Inbound**: image moderation (CSAM/NSFW — provider like Hive, plus PhotoDNA-class hash matching if attainable), text moderation on topic/moral, blocklist for brands/IP characters ("Elsa", "Spiderman" → offer original alternatives to avoid copyright exposure).
- **Outbound**: every generated image passes moderation before being shown; LLM story output moderated; strict child-appropriate system prompts; temperature/style constraints.
- **Prompt injection**: user topic/moral text is data, not instructions — wrap in delimiters, instruct model to ignore embedded instructions, validate output against JSON schema, moderate output regardless.
- Abuse vector: uploading photos of third parties without consent → ToS clause, in-product attestation checkbox ("I am the parent/guardian or have consent"), report/takedown flow, log IP+device for uploads.

### 5.4 Application security
- Auth: managed (Clerk) or Better Auth with 2FA option; session cookies httpOnly/secure/SameSite; password hashing argon2id.
- AuthZ: every asset/story query scoped by `user_id` at the query layer (Prisma middleware) — IDOR is the classic failure here; add tests for cross-tenant access.
- Rate limiting: per-IP (Cloudflare) + per-user (Redis) on auth, upload, and generation endpoints.
- Uploads: presigned PUT with content-type + size limits (≤10 MB, jpeg/png/heic), server-side re-verification, image re-encode (strip EXIF — EXIF contains GPS of your house!).
- Stripe webhooks: signature verification + event id dedup table.
- Secrets: Railway env vars, least-privilege R2 API tokens (separate read vs write tokens per service), no long-lived keys in worker logs.
- Dependencies: Dependabot + `pnpm audit` in CI; lockfile committed.
- Headers/CSP on web; SSRF-safe outbound (worker only calls allowlisted provider hosts).
- Backups: Railway Postgres daily backups + weekly logical dump to R2 (separate bucket, separate token); quarterly restore test.
- Incident response mini-runbook in `docs/`: key rotation steps, user notification template (KVKK breach notification: 72h to KVK Kurumu).

---

## 6. Scalability Plan

| Load driver | Mechanism |
|---|---|
| Interactive traffic | `api`/`web` stateless → Railway replicas + Cloudflare CDN for static/player assets |
| Generation bursts | Queue absorbs bursts; `worker` replicas scale on queue depth; per-stage queues isolate slow stages (illustration) |
| Provider rate limits | Central token-bucket limiter in Redis per provider; graceful queueing, not errors |
| Media delivery | R2 + Cloudflare cache (audio/images are immutable → cache-forever with hashed keys) |
| DB | Read pressure is low (manifests are denormalized JSON); indexes on (user_id, created_at); PgBouncer if needed |
| Cost scaling | Per-story provider spend logged → COGS dashboard; per-user and global daily generation caps as circuit breakers |

Capacity math (MVP): one story ≈ 1 LLM call + 11–13 image calls + 1 TTS call ≈ 3–6 min wall-clock with parallel pages. A single worker replica with concurrency 5 ≈ ~60–100 stories/hour. Scale linearly by replicas; Railway handles this without touching architecture until well past product-market fit. If you outgrow Railway, the same containers move to EKS unchanged — your home turf.

---

## 7. Business Plan

### 7.1 Market & positioning
- Global personalized-kids-content market is validated (Wonderbly: millions of printed books sold). AI entrants (Oscar Stories, Childbook.ai, Bedtimestory.ai) prove demand but are weak on: photo likeness consistency, narration quality, and Turkish.
- Positioning: **"Çocuğunuz kendi masalının kahramanı"** — emotional, gift-friendly, moral-driven. Turkish-first launch (underserved, low CAC via TR parenting communities), English fast-follow.

### 7.2 Pricing (credit + subscription hybrid)
- **Free**: 1 watermarked story (acquisition engine — the output IS the ad; shared stories carry a referral link).
- **Credits (à la carte)**: 1 story = 1 credit. Packs: 1 / ~₺149, 5 / ~₺599, 12 / ~₺1.199 (gift-box framing). USD: $4.99 / $19.99 / $39.99.
- **Subscription**: Aile plan ~₺199/mo → 4 stories/mo + character library + priority queue + voice options; Premium ~₺349/mo → 10 stories + voice cloning + video export in 4K.
- Upsells: extra page-image regenerations, printed hardcover (Phase 3, high margin), gift cards (seasonal spikes: 23 Nisan, Christmas, birthdays).
- Payments: **launch with a Merchant of Record** (Paddle or Lemon Squeezy — apply Day 1) behind the thin `PaymentProvider` adapter. The MoR is the seller of record: it handles global VAT/sales tax and consumer invoicing, which at launch removes the per-sale TR e-arşiv burden (you invoice the MoR monthly — confirm treatment with your mali müşavir). Migrate to Stripe direct + iyzico (TR cards/installments) in weeks 3–6, when fees and TR-currency checkout justify it.

### 7.3 Unit economics (order-of-magnitude, verify current provider pricing at build time)
| Cost item per story | Estimate |
|---|---|
| Story LLM call | $0.01–0.05 |
| 11–13 images (incl. retries) | $0.40–1.50 (provider-dependent; the dominant cost) |
| TTS (~3–4k chars) | $0.05–0.60 (ElevenLabs high end, OpenAI low end) |
| Moderation, storage, egress | ~$0.02 (R2 egress = 0) |
| **COGS total** | **≈ $0.5–2.0 / story** |
- At ₺149 (~$4.5)/story → 55–85% gross margin. Voice cloning and print push margin up. Track real COGS per story in the DB from day one.

### 7.4 Go-to-market (TR launch) — ⚠ SUPERSEDED by docs/marketing-plan.md (2026-07): strategy is now English-first global + multilingual; TR remains the beachhead/test market. Kept for the tactical ideas below.
1. Pre-launch: waitlist LP with a 30-sec demo video (a real child's story), Instagram/TikTok parent creators (gift them stories — output is inherently shareable).
2. Launch: Product Hunt (EN) + TR parenting FB groups/forums, "ilk masal ücretsiz" referral loop (share link grants friend a free story, you earn a credit).
3. Seasonal campaigns: birthdays (calendar-based email automation: "Ali'nin doğum günü yaklaşıyor"), 23 Nisan, bayram, yılbaşı.
4. B2B pilot (Phase 3): 3–5 kindergartens, classroom moral-of-the-month stories.
- KPIs: visitor→free story conversion (target 8–12%), free→paid (target 10–15%), CAC < 1 story pack price, D30 repeat rate, viral coefficient from shares.

### 7.5 Risks & mitigations
| Risk | Mitigation |
|---|---|
| Provider policy blocks child-photo processing | Adapter layer + 2 pre-validated fallback providers; character-sheet indirection reduces exposure |
| Image cost/quality shifts | Provider abstraction; renegotiate style presets per provider |
| Copyright (users request branded characters) | Blocklist + original-alternative UX |
| Likeness disappointment (top churn risk) | Approval step on character sheet BEFORE spending a credit; free regens |
| Privacy incident | §5 architecture; privacy as marketing ("fotoğraflar 24 saat içinde silinir") |
| Single-founder bandwidth | Ruthless MVP scope; managed services everywhere |

---

## 8. Roadmap & Claude Code Handoff

### 8.1 Milestones
- **M0 (week 1)**: monorepo scaffold, CI, Railway staging env, auth, DB schema, R2 wiring. *Exit: deployed hello-world across web/api/worker with a job round-trip.*
- **M1 (weeks 2–4)**: character upload + moderation + character sheet flow; story pipeline end-to-end (fixed style, one voice, TR only); minimal player. *Exit: internal users generate real stories.*
- **M2 (weeks 5–6)**: progress UX, failure/refund paths, library, exports (MP4/PDF), email notifications, watermarked free tier. *Exit: closed beta with 20 families.*
- **M3 (weeks 7–8)**: Stripe+iyzico, credits ledger, subscription, share links, EN language, 3 art styles, observability dashboards. *Exit: public launch.*
- **M4+**: series, multi-character, voice cloning, mobile, print.

### 8.2 CLAUDE.md starter (put at repo root)
```md
# MasalAI
Personalized AI storybook SaaS. See docs/plan.md for full context.
## Stack
pnpm + Turborepo monorepo. apps/web (Next.js 15), apps/api (Fastify),
apps/worker (BullMQ). packages/shared holds ALL zod schemas & types —
API contracts live there, never duplicated. packages/providers holds
Text/Image/TTS/Moderation adapters — never call vendor SDKs directly.
## Rules
- TypeScript strict; no `any`. Validate all external input with zod.
- Every DB query scoped by user_id. Write a test for any new asset/story endpoint proving cross-tenant access fails.
- All jobs idempotent; deterministic R2 keys; retries must be safe.
- Never log photo URLs, signed URLs, or provider API keys.
- Migrations via `pnpm db:migrate`; never edit applied migrations.
- Run `pnpm check` (typecheck+lint+test) before declaring done.
## Env
See .env.example. Secrets only via Railway variables.
```

### 8.3 Suggested build order for Claude Code sessions
1. Scaffold monorepo + shared package + DB schema + docker/Railway configs.
2. Auth + consent flow + user CRUD.
3. R2 presigned upload + asset model + EXIF-strip/re-encode + moderation adapter.
4. Provider adapters (start with one image provider + one LLM + one TTS) with contract tests using recorded fixtures.
5. Pipeline stages as isolated, unit-testable functions; then BullMQ wiring; then progress SSE.
6. Player UI; then library; then exports.
7. Billing; then hardening pass (rate limits, IDOR tests, deletion cascade test).

### 8.4 Early decisions — status ledger (consistency-reviewed)
**Decided** (fixed in handbook §2.1; record as ADR-0001..0004 during M0 — one page each, rationale below):
- ADR-0001 API framework: **Fastify 5 + zod type provider** (less ceremony than NestJS for Claude Code; schemas stay the single contract).
- ADR-0002 Auth: **Better Auth** (no per-MAU cost; self-owned user data matters for a child-photo product).
- ADR-0003 ORM: **Prisma 6** (best-documented option = best agent velocity; revisit only if migration ergonomics bite).
- ADR-0004 Lint/format: **Biome** (single fast tool).

**Open** (each closes with its own ADR, before the milestone that needs it):
- Image provider #1 — bake-off in M1 week 1: same child photo + 3 styles across Gemini image / gpt-image-1 / Flux+PuLID; judge likeness consistency across 10 prompts. Blocks pipeline Stage 1.
- ElevenLabs vs OpenAI TTS for TR — bake-off with 3 parent listeners. Blocks M1 narration.
- Free page-regeneration count per story (2 vs 3) — pricing/UX copy dependency; decide before M2 beta (currently an open item in docs/state/QUESTIONS.md).

---
---

# PART II — Expert Review Addendum (v2)

> Self-review verdict on Part I: the infrastructure plan is solid, but it treats the two things users actually pay for — **story quality** and **illustration quality** — as prompt-engineering afterthoughts, and it ignores the operational reality of running an AI product (human review, support, fraud) and Turkey-specific commercial law. Sections 9–17 close those gaps. Where this addendum changes MVP scope, §17 supersedes §8.1.

---

## 9. Story Quality Engineering (the actual product)

### 9.1 Age bands — one prompt does not fit ages 2–10
Add `target_age_band` to the story request (and to `characters.age` inference):
| Band | Pages ~words/page | Vocabulary | Structure |
|---|---|---|---|
| 2–4 | 20–35 | concrete nouns, repetition, onomatopoeia ("hop hop", "şıp şıp") | circular story, repeated refrain the child can chant |
| 5–7 | 40–60 | simple cause-effect, light humor | classic arc: goal → obstacle → 2 attempts → resolution |
| 8–10 | 60–85 | richer vocabulary, mild suspense | subplot allowed, moral shown-not-told |
Refrain/repetition is a first-class output field (`refrain: string | null`) — it's what makes a story feel like a *masal* and it's a natural read-along hook.

### 9.2 Moral integration patterns (avoid the #1 AI-story failure: preachy endings)
The story LLM must be instructed to pick one of three integration patterns, never a closing lecture:
1. **Consequence pattern** — character experiences the outcome of the lesson naturally.
2. **Mirror pattern** — a secondary character models the wrong behavior; the hero chooses differently.
3. **Discovery pattern** — hero articulates the lesson in their own childlike words in dialogue.
Hard rule in the system prompt: the final page may not begin with "Ve o günden sonra…" style moralizing unless the user explicitly asks for a classical closing formula (offer it as a toggle: "klasik kıssadan hisse kapanışı").

### 9.3 Prompt architecture (two-pass writing)
Single-call generation produces flat stories. Use two cheap passes:
- **Pass A — Story architect**: outputs outline JSON only (arc beats, refrain, moral pattern choice, per-page beat + scene description). Fast, cheap model OK.
- **Pass B — Story writer**: expands the approved outline into final page texts + illustration prompts, with the age-band style card injected.
Benefits: outline is where quality QA runs (cheap to regenerate), illustration prompts derive from scene descriptions (consistent), and "regenerate story text but keep the same plot" becomes possible.

### 9.4 Automated quality gate (LLM-as-judge)
Before illustration ever spends money, a judge call scores the draft (1–5) on: age-appropriateness, moral integration subtlety, character-name usage correctness, refrain presence, Turkish fluency (no translationese), page-count/word-count compliance, safety. Score < threshold on any axis → one automatic rewrite of the failing pages; still failing → human-review flag (see §13). Log all scores → this becomes your quality dashboard and regression suite when you change prompts or models.

### 9.5 Turkish language specifics
- Vowel harmony and suffixation of the child's NAME matters: "Defne'nin", "Yiğit'le". Give the LLM the name + explicit instruction to apply Turkish suffixation correctly; judge checks it.
- Keep a small curated few-shot set of genuinely good TR children's pages (write 6–8 by hand once) — few-shots move quality more than instructions.

### 9.6 Story template library (product + SEO asset)
Curated topic+moral bundles ("Karanlık korkusunu yenmek", "Kardeşini kıskanmamak", "Diş fırçalama macerası") with tuned outlines. These double as programmatic-SEO landing pages (§12.3) and reduce blank-page paralysis in the form.

---

## 10. Illustration System Deep Dive

### 10.1 Composition contract (images must host text + feel like a book)
Every illustration prompt is assembled from a fixed template, never free-form:
`[style token block] + [character ref instruction] + [scene from Pass A] + [composition rule] + [negative rules]`
- **Composition rule** per page alternates layouts (wide establishing / medium action / close emotional) for visual rhythm, and reserves clean space where the player overlays text (bottom third or side panel — decide once, encode in template).
- **Negative rules**: no text/letters in image (AI text is gibberish and clashes with overlay), no brand characters, no scary shadows for band 2–4.
- Aspect ratio: 3:2 landscape for player + video export; cover portrait 2:3 rendered separately with title typography done in code (not by the image model) → crisp, consistent covers.

### 10.2 Multi-character consistency (Phase 2, but architect now)
Consistency degrades fast beyond one character. Mitigations: max 2 photo-based characters per scene at launch of the feature; both character sheets passed as refs; scenes alternate solo/duo pages; judge-style automated likeness check (embedding similarity between page-image face crop and character sheet — flag outliers for auto-regen). Store per-page `characters_present` (already in schema) to drive which refs are attached.

### 10.3 Retry & cost budget
- Per-page retry budget: 2 auto-retries with prompt perturbation, then accept-best (rank by moderation pass + likeness score).
- Per-story hard cost cap (e.g., $3.50) enforced in the pipeline — a runaway retry loop must be impossible.
- Resolution tiers: generate at display resolution (~1024–1536 px long edge); upscale on-demand only for print/4K export (Phase 3) — don't pay 4K prices for phone screens.

### 10.4 Style presets as versioned artifacts
Each art style = a versioned JSON (style token block, negative rules, character-sheet generation params, per-provider overrides). Stored in repo (`packages/providers/styles/*.json`), stamped onto each story (`style_version`) so regeneration years later reproduces the same look, and A/B testing new styles is a config change.

---

## 11. Audio & Player Engineering

### 11.1 Narration quality
- Per-page synthesis (not one long file): enables page regen without re-paying full TTS, and clean per-page timings.
- Turkish name pronunciation: maintain a pronunciation hint map; for ElevenLabs use phoneme/spelling hints where a name mis-renders (test with your beta names list).
- Pacing for children: slightly slower rate, sentence-level pauses; refrain lines get a playful delivery instruction where the provider supports style prompts.
- Loudness normalization to −16 LUFS (mobile speech standard) in the worker (ffmpeg `loudnorm`) — mixed provider outputs otherwise vary wildly.
- Optional ambient bed (Phase 2): 2–3 licensed loops (CC0/paid-license, documented) mixed at −28 dB under narration; off by default, toggle in player.

### 11.2 Player (this is where "wow" happens — budget real effort)
- Web player = the product demo, the share-link landing experience, and the retention surface. Performance budget: first page visible+audible < 2.5 s on mid-range Android over 4G.
- Preload strategy: page N playing → prefetch N+1, N+2 images + audio; all assets immutable hashed URLs → cache-forever.
- Read-along: sentence-level highlighting from TTS alignment timestamps (word-level where provider gives it); auto page-turn on audio end with a page-flip animation; manual swipe always wins and re-syncs audio.
- Modes: "Dinle" (auto narrated), "Ben okuyorum" (no audio, tap to turn), "Uyku modu" (dimmed palette, slightly slower audio if provider supports, auto-stop at end — no loops, no engagement tricks; this is a bedtime product and must respect that).
- Accessibility: captions inherent, font-size control, WCAG AA contrast for text overlay (auto-place text on a soft scrim), reduced-motion option.
- Offline (Phase 3 mobile): manifest is already a self-contained JSON → straightforward to cache.

### 11.3 Video export (MP4)
ffmpeg in worker: per-page still + subtle Ken Burns pan/zoom + crossfade + narration + optional burned-in subtitles; 1080p default. Free-tier exports watermarked (corner logo + end card with referral URL — the watermark IS the growth loop). Generate lazily on first request, cache in R2.

---

## 12. Growth Infrastructure

### 12.1 Product analytics
- PostHog (EU cloud or self-host later): event schema defined in `packages/shared/analytics.ts` (typed events — Claude Code keeps it consistent). Core funnel: `signup → consent_ok → character_created → sheet_approved → story_submitted → story_ready → played_>50% → export_or_share → purchase`.
- Per-story quality telemetry joins product data: judge scores + regen counts + play-completion → find which topics/styles drive purchases.
- Session replay OFF by default app-wide (child-adjacent content; privacy posture > debugging convenience). Enable only on marketing pages.

### 12.2 Lifecycle messaging (Resend or Postmark + react-email templates)
Transactional: verify, story-ready, refund, deletion receipt. Lifecycle: D1 "ilk masalını oluştur" nudge, story-ready → D3 "yeni konu önerileri", birthday automation (child's birthday collected at character creation → T-7 days "doğum günü masalı" campaign — highest-intent email in the whole system), win-back at credit exhaustion. All lifecycle mail behind explicit marketing consent (separate from transactional).

### 12.3 SEO & content
- Programmatic pages from the template library (§9.6): `/masal/dis-fircalama`, `/masal/kardes-kiskancligi` — each with a sample story player embed (huge dwell time) + template CTA. TR children's-content search space is uncontested.
- Share pages are public-cacheable, OG-image = story cover with child's face **only if sharer opts in**, otherwise stylized cover without face (default). Never index share pages (noindex) — they're private-ish; index template pages instead.

### 12.4 Referral loop mechanics (make the numbers explicit)
Shared story end card / watermark → visitor lands on the story player (not the homepage) → "Sen de çocuğun için oluştur — ilk masal hediye" → attributed via share token → sharer earns 1 credit on friend's first *completed* story (not signup — resists fraud, §14). Cap 5 earned credits/month.

---

## 13. Back Office & Operations (missing from v1 — legally and operationally mandatory)

### 13.1 Admin panel — DECIDED: role-gated routes inside apps/web (`/app/yonetim`), not a separate service. One less Railway service, shared auth/session, and the token theme for free; extract later only if admin traffic or permissions complexity demands it.
- **Human moderation review queue**: everything auto-flagged (inbound photos, judge-failed stories, outbound image moderation borderlines, user reports) lands here with approve/reject/ban actions. Target SLA: < 4 h daytime. This queue is a legal necessity (CSAM handling obligations) — with documented escalation: confirmed CSAM → preserve evidence, report to authorities (TR: savcılık/İhbarweb; NCMEC if US nexus), never just delete silently.
- User lookup: stories, jobs, credits ledger, consent records; actions: refund credit, re-run job, resend email, hard-delete (dual-confirm).
- Impersonation ("view as user") with mandatory audit-log entry and banner.
- Ops dashboards: DLQ browser with requeue button, per-provider error rates, live COGS.
- Feature flags & style-preset toggles editable here.

### 13.2 Support
- Crisp/Plain chat widget + help center (Turkish first): 10 articles cover ~80% of tickets (photo tips for best likeness, why story failed, refunds, deletion, likeness expectations).
- Refund policy encoded, not ad-hoc: failed generation → auto-refund (already in v1); "beğenmedim" → 1 goodwill regen, then case-by-case. Support macros for both.
- Photo-tips content matters commercially: likeness quality correlates with input photo quality (front-facing, good light, no sunglasses) — teach at upload time with inline examples, cut your worst churn driver at the source.

### 13.3 Runbooks (docs/runbooks/)
provider-outage failover, queue-stuck, stripe-webhook-replay, data-deletion-verification, breach-response (extends §5.4), cost-spike. Each ≤ 1 page, tested once.

---

## 14. Fraud & Abuse Prevention (free tier will be farmed — plan for it day one)

- Free story requires verified email + rate-limit per IP/day; block disposable-email domains (maintained list + MX heuristics).
- Device fingerprint (lightweight, e.g., FingerprintJS OSS) + payment-instrument uniqueness for referral credit grants.
- Referral credit granted on friend's completed story, not signup (§12.4); asymmetric caps.
- Velocity rules: > N characters or stories/day per new account → auto-hold for review.
- Stolen-card risk (credit packs are classic carding targets): Stripe Radar rules + 3DS required for TR cards (iyzico enforces anyway); credits from disputed payments clawed back via ledger entry (append-only ledger makes this clean).
- Content abuse: attempts to generate non-child-appropriate content with the pipeline → moderation already blocks; repeated attempts → progressive throttle → ban. Log attempt patterns.

---

## 15. Turkey-Specific Commercial & Legal (missing from v1)

- **Company formation**: iyzico + Stripe require a legal entity; şahıs şirketi is fastest for MVP (bkz. e-Devlet kuruluş), migrate to Limited Şti. before serious revenue (liability isolation matters when you hold children's data). Get an accountant (mali müşavir) before first sale.
- **E-invoicing**: launch simplification — under the MoR model (§7.2) the MoR is the seller, so per-consumer e-arşiv fatura is not triggered; you issue one monthly invoice to the MoR (verify with your mali müşavir). Once Stripe/iyzico direct goes live (weeks 3–6): every sale needs e-arşiv fatura; integrate Paraşüt/BirFatura/Logo İşbaşı API into the Stripe/iyzico webhook flow (invoice auto-issued on payment). This is commonly forgotten and painful to backfill.
- **Mesafeli Satış Sözleşmesi + Ön Bilgilendirme Formu**: mandatory for TR e-commerce; digital-content exception to the 14-day cayma hakkı applies **only if** the user explicitly consents to immediate performance and acknowledges losing withdrawal — add that checkbox to checkout, store it.
- **KVKK deliverables checklist** (extends §5.1): aydınlatma metni (TR+EN), açık rıza metni (child photo processing, separate), çerez politikası + banner, veri saklama/imha politikası, VERBİS assessment, processor DPA inventory (Railway, Cloudflare, Stripe, iyzico, AI providers, Resend, PostHog).
- **Pricing display**: TRY prices KDV-inclusive by law; %20 KDV on digital services — set Stripe Tax / iyzico accordingly and reflect in unit economics (§7.3 margins are pre-VAT).
- If selling to EU consumers: OSS VAT registration threshold awareness; Stripe Tax handles calculation.

---

## 16. Testing Strategy & Quality Gates (concretizing v1's one-liner)

| Layer | Approach |
|---|---|
| Shared schemas | zod schemas are the contract; property-based tests on parsers |
| Providers | Contract tests against recorded fixtures (nock/msw); one live smoke test per provider behind `RUN_LIVE=1`, run nightly not on PR |
| Pipeline | Each stage = pure function tested with golden fixtures; full pipeline integration test with all providers mocked producing a complete manifest |
| Story quality | Judge harness (§9.4) doubles as regression suite: 20 canonical requests, snapshot judge scores; prompt/model changes must not regress mean score (CI gate, live-LLM nightly job) |
| Security | Cross-tenant IDOR test suite (every asset/story route × foreign user id); deletion-cascade verification test (creates user+story, deletes, asserts zero DB rows + zero R2 keys); EXIF-strip test |
| Web | Playwright: signup→character→submit (mocked pipeline)→player plays with page turn; axe accessibility check on player |
| Load | k6 script: 100 concurrent story submissions → assert queue drain time & zero DLQ before each launch |

CI gates on PR: typecheck, lint, unit+integration (mocked), IDOR suite, build. Nightly: live provider smokes, judge regression, k6 light.

---

## 17. Sprint Plan — Claude Code full-speed mode (supersedes §8.1 and the earlier week-based schedule)

> Development is executed entirely by Claude Code, with the founder orchestrating **2–4 parallel sessions/day** (protocol §12). Code is no longer the calendar bottleneck. What still consumes wall-clock time is pinned to **Day 1** so it runs alongside the code: payment-account onboarding, the image-provider bake-off, legal-text review, and recruiting real beta families.

- **Day 1 — S0 Foundation.** Morning session: local walking skeleton + protocol infrastructure (kickoff doc). Afternoon session: Railway staging deploy of all three services, CI-gated; ADR-0001..0004. **Non-code, also Day 1:** apply for Merchant-of-Record account (§7.2 — the fastest-onboarding payment path), buy domain/DNS, Claude-draft KVKK/ToS/consent texts and send for müşavir/lawyer async review, start the creator outreach list (marketing plan W1).
- **Days 2–3 — S1a Pipeline core** (parallel streams per protocol §12: A worker+providers · B api+db · C web+ui tokens): character upload + moderation + character sheet; two-pass story generation + judge gate (§9); illustration system + per-story cost cap (§10). **Day 3 = the image-provider bake-off, timeboxed to ONE day** — decision by evening as ADR-0005; a "good enough to launch" pick beats a perfect pick two weeks late (adapter layer makes it reversible).
- **Days 4–5 — S1b Experience:** per-page TTS + loudnorm (§11.1), assembly + manifest, progress SSE with live page thumbnails, player v1 (Dinle mode + read-along), library. **S1 gate, Day 5 evening: a complete story generated end-to-end on staging.**
- **Days 6–7 — S2 Hardening:** failure/refund paths, MP4 export + watermark loop, transactional e-mails, free-tier flag, minimum-viable admin moderation queue (legally required pre-users, §13.1), rate limits, IDOR + deletion-cascade tests green, 15 template/SEO pages seeded. **Day 7 gate: full DoD + k6 light + the four protocol drills (protocol §10).**
- **Days 8–9 — Founding beta blitz (48 h):** 15–25 real families (founding buyers + gifted creators) generate stories on production infra behind an invite flag; top-3 frictions fixed same-day; likeness-approval and completion metrics collected (ux-plan §13).
- **Days 10–11 — Monetization:** MoR checkout live (credit packs only — subscriptions deferred to weeks 3–6), credits ledger wired, paywall UX, pricing page (USD primary), Gündüz theme QA, legal texts finalized.
- **Days 12–14 — SOFT LAUNCH:** invite flag off, waitlist e-mail fires, referral loop on, paid creative tests start small (marketing §4). Product Hunt deliberately does **not** fire here — it lands week 3–4 on a stability-proven product, as the concentrated PR moment.
- **Weeks 3–6 — fast-follows:** Stripe direct + iyzico + e-arşiv integration (TR-currency checkout opens), subscriptions, DE/ES locales, multi-character, voice options, Product Hunt launch.
- **Slip rule (pre-decided, zero drama):** if the Day-7 gate fails, launch moves to Day 21 and the beta window widens. **Scope is never un-tested to protect a date** — the gates (judge suite, IDOR, deletion, drills) are the non-negotiable floor that makes this speed safe. The one clock we don't control is payment-account approval; hence the Day-1 application and the MoR choice.


---

## 18. Top 5 open risks after v2 (ranked)
1. **Likeness consistency across 10 pages** — mitigated by character-sheet indirection + likeness scoring, but only the bake-off gives certainty. Do it first.
2. **TR TTS quality/pricing** at children's-content bar — bake-off with real parents; budget alternative: OpenAI TTS at 5–10× lower cost if quality passes.
3. **Provider policy drift on minors' imagery** — the character-sheet indirection is also the strategic hedge; keep Flux-family self-servable path warm as the fallback that no policy can revoke.
4. **Unit economics under regens** — cost cap (§10.3) + real COGS telemetry from first beta story.
5. **Solo-founder ops load post-launch** (moderation SLA + support) — template answers, strict queue SLAs, and honest daily time budget (~1 h/day); if exceeded consistently, first hire is part-time support/moderation, not an engineer.
