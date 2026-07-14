# MasalAI — AI Provider Scale & Failover Architecture
### Queue Topology, Adaptive Multi-Provider Routing, Rate-Limit-Aware Scaling

> Seventh document of the set (`docs/ai-provider-scale-architecture.md`). Normative for `apps/worker` and `packages/providers`; plan.md §4.4 and §6 defer to this document for provider-limit behavior.
>
> **Reference:** `docs/reference/AI_PROVIDER_SCALE_ARCHITECTURE.md` (ZiraAI, 2026-07-12) — a production-verified multi-provider architecture we mine deliberately. We adopt its proven load patterns (two-tier Redis sliding-window limiting, delayed retry, per-provider isolation, DLQ discipline, URL-based media, runtime cost metadata) and we close the two gaps its own §7 honestly documents: **no cross-provider failover** and **circuit breaker typed but never implemented**. Those two are precisely this document's core.

---

## 1. First principles (answers to the governing questions)

1. **Is story creation fully asynchronous?** Yes, end to end. `POST /stories` validates, debits a credit hold, enqueues, and returns `202` with a story id in <200 ms. All AI work happens in worker stages; the user watches progress via SSE or leaves and gets notified (plan §4.4, ux-plan §6.5). **No user request ever waits on an AI provider synchronously** — the reference doc's "özün özü" (accept → decouple → route smartly → limit before work → scale independently → deliver async) is adopted verbatim as our contract.
2. **Deployment is Dockerfile-only.** Every Railway service builds from a repo-committed multi-stage `Dockerfile` (`infra/railway/Dockerfile.{web,api,worker}`) — no Nixpacks/auto-build. Same image locally, in CI, on Railway (handbook §2.2 parity rule). Replica scaling operates on these images.
3. **Queue technology: BullMQ on Redis — with the RabbitMQ question answered honestly (ADR-0006).** See §2.1.

---

## 2. Queue Topology

### 2.1 ADR-0006 — BullMQ vs RabbitMQ (the recommendation, engaged seriously)
RabbitMQ is what the reference architecture runs on, and it earns its place there: **two languages** (.NET publisher + TS workers) need a broker as the only integration surface, and TTL+DLX delayed queues are elegant. MasalAI's context differs on every axis that made RabbitMQ right for ZiraAI:

| Axis | ZiraAI | MasalAI | Consequence |
|---|---|---|---|
| Languages across the queue | .NET ↔ TS | TS ↔ TS (one monorepo, shared zod types) | Broker-as-integration-surface value disappears |
| Infra already present | RabbitMQ + Redis | Redis required anyway (rate limits, cache, flags) | RabbitMQ = one extra stateful service to run, monitor, upgrade on Railway |
| Delayed delivery | TTL+DLX pattern (manual queue-per-delay) | BullMQ native `delay`/backoff per job | Same behavior, zero topology management |
| Fan-out with completion tracking | hand-rolled | BullMQ **FlowProducer** (parent job completes when 11 child page-jobs finish) — exactly our illustrate stage | Meaningful code saved |
| Where routing happens | at dispatch (provider fixed per message) | **at call time inside the stage** (§4) | We don't need per-provider *queues* at all — see below |

**Decision:** BullMQ. **Pre-committed revisit triggers** (any one → migrate, the queue layer is a thin module): a second implementation language joins the system; sustained >100k jobs/day with complex routing needs; Redis memory pressure from queue payloads. Payloads are tiny by design (ids + R2 URLs, never binary — the reference doc's URL-based media rule §3.1 adopted: images move as R2 URLs, messages stay ~1–2 KB).

### 2.2 Queues (per pipeline stage, not per provider — a deliberate inversion)
```
story.plan → story.illustrate (FlowProducer: 1 parent + 11 page children) → story.narrate → story.assemble
charsheet.generate · story.export (lazy) · dlq.* (per stage)
```
The reference architecture routes to **per-provider queues** and fixes the provider at dispatch. We invert this: queues are **per stage**, and the provider decision happens **per attempt, inside the stage, at call time** via the Provider Router (§4). This inversion is what makes true failover possible — in the provider-queue model, a message parked in `gemini-queue` is stranded if Gemini degrades (the reference doc's §7 failover gap is *structural*, not an oversight). In the call-time model, the very next attempt simply routes elsewhere. Trade-off accepted: per-provider *worker* scaling becomes per-*stage* scaling + per-provider concurrency caps (§7), which fits us because our expensive stage (illustrate) is multi-provider by design.

---

## 3. Component Topology

```
apps/api ── enqueue(storyId) ──▶ Redis/BullMQ stage queues ◀── apps/worker (N replicas, Docker)
                                                                   │ per job attempt
                                                                   ▼
                                                    ┌─────────────────────────────┐
                                                    │ PROVIDER ROUTER (§4)         │
                                                    │  packages/providers/router   │
                                                    │  1 capability registry       │
                                                    │  2 candidate scoring         │
                                                    │  3 admission (limits §5)     │
                                                    │  4 breaker check (§6)        │
                                                    │  5 pinning rules (§7-story)  │
                                                    └──────┬──────────────────────┘
                                     ┌────────────────────┼────────────────────┐
                                     ▼                    ▼                    ▼
                              ImageProvider A       ImageProvider B      ImageProvider C
                              (primary)             (fallback-1)         (fallback-2)
                                     └────────── shared Redis state ──────────┘
                    ratelimit:{provider}:{cap} (ZSET sliding window · RPM + TPM/IPM)
                    breaker:{provider}:{cap}   (closed|open|half-open + timestamps)
                    penalty:{provider}:{cap}   (429 Retry-After box)
                    pin:story:{id}:{cap}       (consistency pinning §7)
```
All router state lives in **Redis, shared across every worker replica** — the reference doc's key insight (§6: "centralized counters keep limits truly global under horizontal scale") is preserved and extended to breaker/pin state. The router is a pure library inside `packages/providers` (no new service): every stage calls `router.execute(capability, request, ctx)`.

---

## 4. The Provider Router (the failover core)

### 4.1 Capability registry (runtime-tunable, adopted & extended from reference §5.1)
```ts
capability: 'story-text' | 'judge' | 'image-charsheet' | 'image-page' | 'tts'
ProviderEntry = {
  id, capability, priority,            // priority order = preference (quality/cost policy per capability)
  rpmBudget, tpmBudget | ipmBudget,    // OUR ceilings, set 10–20% under vendor's real limits
  softHeadroom: 0.8,                   // §5 proactive-shift threshold
  costPerUnit, qualityScore,           // runtime-overridable via PROVIDER_METADATA env (reference §5.1 pattern)
  storyPinned: boolean                 // §7 — true for image-page & tts
}
```
Selection policy per capability, not global: `image-page` runs QUALITY_FIRST-with-failover (likeness is the product), `judge` runs COST_OPTIMIZED (reference §4.2 strategy vocabulary reused where it maps).

### 4.2 Selection algorithm (every attempt, ~2 Redis round-trips)
```
candidates = registry[capability] ordered by priority
if pin exists for (story, capability) → move pinned provider to front (§7)
for p in candidates:
  1 breaker(p) == open?            → skip
  2 penalty-box(p) active?         → skip           (§5.4)
  3 admission: sliding-window usage(p)
       < soft (80%)                → SELECT p        (normal)
       soft…hard                   → SELECT p only if no lower-priority candidate is < soft
                                     (proactive overflow shift — "yaklaşınca geç")
       ≥ hard (100%)               → skip            (delay, don't burn a 429)
all skipped → job.moveToDelayed(backoff)             (BullMQ-native reference-§4.3 delayed pattern)
```
**Switch-back is structural, not an event:** because selection re-runs from the priority list on *every attempt*, the moment the preferred provider's window drains / breaker half-opens / penalty expires, traffic returns to it automatically. Anti-flap hysteresis in §6.3.

### 4.3 On-failure ladder (per attempt)
`429` → penalty-box for `Retry-After` (or 60 s) + breaker failure count + re-route same attempt to next candidate. `5xx/timeout` → breaker failure count + next candidate. Content-policy rejection → **NOT a provider failure**: prompt-perturbation retry on the same provider (plan §10.3), never failover (other vendors will likely reject too; don't poison breaker stats with our own content issues). Candidates exhausted → delayed retry; attempts exhausted → stage DLQ + story failure path (credit refund, plan §3.2).

---

## 5. Rate Limiting — two tiers, adopted from the reference and upgraded

### 5.1 Tier 1 — Router admission (prevention; reference §4.3 equivalent)
Redis **sliding-window ZSET** (the reference §6 implementation is adopted almost verbatim — it is correct and battle-tested): 60 s window, `zremrangebyscore` + `zcard` + pipelined `zadd`, one key per `(provider, capability)`. Counters are global across replicas by construction. Upgrades over the reference:
- **Atomicity:** the check-then-add pair runs as a single **Lua script** — the reference's two-step pattern can over-admit under high concurrency (N replicas racing between `zcard` and `zadd`). At ZiraAI's volumes that slack is tolerable; our budgets are tighter and Lua costs nothing.
- **Dual budgets:** RPM **and** TPM (text) / images-per-minute (image gen) — vision/image vendors meter both; a request admitted on RPM can still 429 on tokens. Estimated cost is reserved at admission, corrected after the call with actuals.
- **Soft/hard thresholds** (§4.2): the reference is binary allow/delay; we add the 80% headroom band that triggers *proactive* overflow-shift to fallback — this is the "sınıra yaklaşıldığında geç" requirement, implemented as admission policy rather than error reaction.

### 5.2 Tier 2 — SDK safety net
Provider SDK config: `maxRetries: 2`, explicit timeouts (reference §7.2 pattern). The reference's Layer-2 worker re-check exists there because dispatch and processing are separated in time; in our call-time model Tier 1 *is* at processing time, so a second counter adds no safety — but its documented failure mode does teach us one thing: the reference doc's §5.4 warning (rate-limit error swallowed instead of re-thrown, silently disabling the requeue path) becomes a **contract test** here: `RATE_LIMITED` results MUST propagate as retryable errors, never as published failure responses. A fixture test asserts it.

### 5.3 Fail-open, bounded
Redis down → limiter fails open (reference §6 trade-off accepted: an outage must not halt the product) — but bounded by two guards that don't depend on Redis: per-story hard cost cap (plan §10.3, enforced in Postgres) and BullMQ per-queue concurrency ceilings (§7). Fail-open therefore risks 429s, never runaway spend.

### 5.4 Penalty box
Any vendor `429`/`503 + Retry-After` sets `penalty:{provider}:{cap}` with that TTL. Admission skips penalized providers. This honors vendor signals *exactly* instead of guessing, and is the fast path that shifts traffic within seconds of a vendor throttling us.

---

## 6. Circuit Breaker & Recovery (the reference's typed-but-unimplemented §7.2 config, implemented)

### 6.1 States, per (provider, capability), in Redis (shared across replicas)
- **closed** → normal. Failure counting on a rolling window (`failureThreshold: 5 failures / 60 s` or failure-rate ≥ 50% with ≥ 10 calls).
- **open** → provider skipped entirely for `cooldown: 30 s` (traffic flows to fallbacks *by the §4.2 selection loop* — opening a breaker requires no rerouting code).
- **half-open** → after cooldown, admit **probe traffic only**: 1 concurrent call, max 10% of capability traffic. `successThreshold: 3` consecutive → closed (full switch-back). Any failure → open, cooldown ×2 (cap 10 min).

### 6.2 Switch-back guarantees (the second half of the requirement)
Recovery to the preferred provider is automatic and gradual: half-open probes → closed → §4.2 puts it back at the front of the candidate list → traffic drains back as its sliding window allows. No operator action, no config flip.

### 6.3 Anti-flapping hysteresis
Minimum residence: once traffic shifts to a fallback, the preferred provider must hold closed state for `minResidenceMs: 120 s` before regaining >50% of traffic (weighted ramp 10→50→100%). Prevents oscillation when a vendor is *marginally* degraded — the failure mode naive failover systems die of.

### 6.4 Manual override
`PROVIDER_FORCE={cap}:{provider}` env (reference §8 "acil geri alma" spirit): pins routing for incident response, logged loudly, expires with the deploy.

---

## 7. Consistency-Aware Failover (MasalAI-specific — where we must be smarter than generic failover)
A plant-analysis request is stateless; **a storybook is not**. Mid-story provider switches destroy the product:

| Capability | Pinning | Failover granularity | Rationale |
|---|---|---|---|
| `story-text`, `judge` | none | per call | Any strong LLM yields equivalent JSON; free failover |
| `image-charsheet` | creates the pin | per story(character) | The sheet's provider defines the visual dialect |
| `image-page` | **pinned to charsheet's provider** | **whole story** | 11 pages must share one model's style; cross-provider pages visibly clash |
| `tts` | pinned to first page's voice+provider | whole story | Mid-story narrator change is jarring; voice ids don't map 1:1 across vendors |

Pinned-capability failure policy: same-provider retries with backoff first (breaker still counting). If the provider hard-fails mid-story (breaker opens): **re-pin the story** to fallback and regenerate the style-critical artifacts from the charsheet forward — correctness over cost, but bounded by the per-story cost cap; cap breach → fail story, auto-refund, alert (a rare, monitored event — metric §9). New stories meanwhile pin to the fallback at creation, so only in-flight stories pay the re-pin cost. Each provider's style presets are pre-tuned per vendor (plan §10.4 versioned style JSONs carry per-provider blocks), so a re-pinned story is consistent *within itself* — the non-negotiable bar.

---

## 8. Scale Mechanics on Railway (Dockerfile-first)
- **Images:** multi-stage Dockerfiles per service, pnpm-pruned production layers, non-root user, `HEALTHCHECK`; worker honors SIGTERM → `worker.close()` grace 120 s (handbook §5.3) so replica scale-down never kills mid-story stages.
- **Scaling unit = worker replicas** (competing consumers on stage queues — reference §5.3 model, BullMQ semantics). Per-stage concurrency inside each replica: `illustrate: 4 · narrate: 4 · plan/judge: 8 · assemble: 2` (env-tunable). Global provider ceilings live in Redis (§5), so **adding replicas never multiplies provider pressure** — the precise property the reference architecture's centralized counters exist for.
- **When to scale (queue-depth driven):** alert at `waiting > 25 jobs or oldest-wait > 90 s per stage` (Grafana, plan §4.9) → raise replicas (Railway UI/API; automate via a tiny cron against Railway's API post-launch). Scale down at sustained idle. Replica math: 1 replica ≈ 15–25 stories/hr at default concurrency; provider budgets, not CPU, are the binding constraint — scaling past `Σ provider ipmBudget` just moves waiting from queue to admission-delay.
- **Playbook (reference §9 format):** latency up → replicas +1..N, watch admission-delay metric: if delay dominates, the constraint is vendor budget → raise budgets (if vendor tier allows) or add a provider to the registry, not replicas. 429 storm → penalty box already absorbing; verify budgets ≤ real vendor limits. Cost spike → check fallback-rate metric (expensive fallback may be carrying traffic); force-close via §6.4 only with cause. Vendor incident → nothing to do: breaker+penalty already shifted traffic; watch the recovery ramp.

## 9. Observability (extends plan §4.9)
Per (provider, capability): `admission_utilization_ratio` (sliding window vs budget), `breaker_state`, `fallback_rate`, `penalty_seconds_total`, `provider_cost_usd_total`, `attempt_outcome{ok|429|5xx|policy}` — plus `story_repin_total` (should be ≈0; each occurrence reviewed) and per-stage `queue_waiting`/`oldest_wait_seconds`. Alerts: breaker open > 5 min on a pinned capability (SEV2), fallback_rate > 30% for 15 min, admission delay p95 > 60 s, any repin. Every provider call logs `{requestId, storyId, provider, cap, attempt, outcome, latency, cost}` — the reference doc's cost-in-response practice (§5.1) made mandatory.

## 10. Config Reference (env knobs — reference §8 convention)
`PROVIDERS_REGISTRY` (JSON: entries per §4.1, runtime-reloadable) · `RL_SOFT_HEADROOM=0.8` · `BREAKER_FAILURES=5 / BREAKER_WINDOW_MS=60000 / BREAKER_COOLDOWN_MS=30000 / BREAKER_MIN_RESIDENCE_MS=120000` · `PROVIDER_FORCE` (§6.4) · per-stage `CONCURRENCY_*` · `RL_ENABLED=true` (instant global bypass, reference §8 rollback lever) · story cost cap stays in plan §10.3.

## 11. Deltas from the reference architecture (honest ledger)
| Reference (ZiraAI) | MasalAI | Why |
|---|---|---|
| RabbitMQ, two-language | BullMQ, single-language (ADR-0006 + revisit triggers) | §2.1 |
| Per-provider queues, provider fixed at dispatch | Per-stage queues, provider chosen per attempt | Makes failover structural (§2.2) |
| No cross-provider failover (its §7 note) | Router ladder + breaker + penalty box | The core requirement |
| Circuit breaker typed only | Implemented, Redis-shared, half-open probes | Its §7.2 config realized |
| Binary allow/delay limiting | Soft-headroom proactive shift + dual RPM/TPM budgets + Lua atomicity | "Approach → shift" semantics |
| Stateless per-request routing | Consistency pinning (story-level) | Storybooks aren't plant photos (§7) |
| Layer-2 swallow bug (its §5.4 warning) | Contract test: RATE_LIMITED must propagate retryable | Learn from the documented wound |
| Kept as-is | sliding-window ZSET, delayed retry, DLQ discipline, URL-not-base64 media, runtime cost metadata, centralized Redis counters, graceful shutdown | Proven — don't reinvent |
