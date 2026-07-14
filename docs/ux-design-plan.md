# MasalAI — UX & Interface Design Plan
### Experience Vision, Design System, Screen Specifications & Content Design

> Fourth document of the set. Governs everything the user sees and feels in `apps/web`. Claude Code implements against this the way it implements against the handbook: token names, component inventory, screen specs and microcopy rules here are contracts, not suggestions. Doc-Touch Matrix addition: **any PR that changes a user-facing screen updates the relevant section here.**

---

## 1. Experience Vision

### 1.1 The one-sentence brief
A parent, holding a phone in a dark bedroom next to a sleepy child, should be able to summon a beautiful story about that child — and the interface should feel like part of the bedtime ritual, not an interruption of it.

### 1.2 Design personality
**"Gece masalı" (the night tale):** calm, warm, quietly magical, deeply trustworthy. Not a toy app (parents are the users, not children), not a sterile SaaS dashboard (the product is an emotional gift). The register of a beloved children's-book publisher, executed with the discipline of a modern product.

### 1.3 Five governing principles (every design decision must survive these)
1. **Night-first.** The product's home is a dark bedroom at 21:00. The default app theme is a deep night palette; the light "Gündüz" theme is the secondary derivation — the inverse of almost every SaaS. No screen may ever flash white during the bedtime flow.
2. **The child is the hero; the parent is the reader.** Emotion (the child's face, the story) always outranks chrome. UI recedes; content glows.
3. **Trust must be visible, not stated.** Every privacy promise (photo deletion, private-by-default) has a UI artifact the parent can see and touch — badges, timers, receipts. (§11)
4. **One hand, one thumb.** Every core flow completable one-handed on a 6" phone. Primary actions live in the bottom 40% of the viewport.
5. **Magic with restraint.** One orchestrated signature moment per screen; everything else is quiet. Waiting, errors, and empty states are designed with the same care as the happy path — in this product, the *wait* is a main screen.

### 1.4 The signature element: **Fener (the lantern glow)**
A single, warm radial lamplight glow on the night canvas — the visual thesis of the brand ("a story is a light in the dark"). It appears in exactly four places and nowhere else: the landing hero (behind the demo book), the generation-progress screen (the story "brews" under the lantern), the player's sleep-mode dimmer (the glow slowly shrinks as the story ends), and the app icon/logomark. It is implemented once as a CSS radial-gradient token (`--glow-fener`), never as an image. This is the one memorable thing; everything around it stays disciplined.

---

## 2. Users & Context of Use

| Persona | Context | Design consequences |
|---|---|---|
| **Akşam ebeveyni** (primary): parent 28–45, phone, 20:00–22:00, dim room, child beside them | Low light, one hand, low patience, emotionally open | Night theme default, large touch targets (≥48px), player reachable in ≤2 taps from anywhere, volume-safe autoplay rules |
| **Gündüz planlayıcı**: same parent at lunch, planning a birthday story, possibly desktop | Exploratory, comparison mindset | Rich creation flow with previews; desktop layout is a widened phone, not a different product |
| **Hediye eden** (grandparent/relative): lower tech confidence | Arrives via share link | Share-link landing = instant playing story, zero-jargon path to "create one" |
| The child (co-viewer, never account holder) | Watches/listens over the parent's shoulder | Player visuals full-bleed; no ads-like elements, no dark patterns visible to a child; nothing scary in loading states |

Device reality assumption: **≥75% mobile web**, mid-range Android significant → performance budgets in §10 are design constraints, not engineering afterthoughts.

---

## 3. Brand & Aesthetic Direction

### 3.1 Color system — night-first palette
The default canvas is deep night blue — chosen because the product lives at bedtime, and because it makes the illustrations and the child's face the brightest objects on screen. (Deliberately NOT the cream-paper + terracotta storybook cliché; our "paper" is the night sky.)

| Token | Hex | Role |
|---|---|---|
| `night-900` | `#141830` | App background (Gece theme) — deep indigo, never pure black |
| `night-800` | `#1C2142` | Cards, sheets |
| `night-700` | `#272D56` | Elevated surfaces, inputs |
| `moon-100` | `#F2EEE3` | Primary text on night; page background in Gündüz theme |
| `moon-300` | `#C9C4B4` | Secondary text on night |
| `fener-400` | `#F2B54B` | THE accent: primary buttons, active states, the glow. Warm lamplight amber |
| `fener-600` | `#C98A2E` | Accent pressed/borders; accent-on-light in Gündüz |
| `haze-400` | `#8B87C4` | Secondary accent: links, selected chips, illustration support — dusk lilac |
| `rose-300` | `#E8A9A0` | Tertiary/decorative only (character/blush moments) |
| `success-400 / error-400 / warn-400` | `#7BC49B / #E07A6B / #E8B65A` | Functional, muted to stay in-world |
| `--glow-fener` | radial `fener-400` @14% → transparent | The signature. Max one instance per screen |

Rules: text contrast ≥ 4.5:1 always (`moon-100` on `night-900` = ~12:1). `fener-400` is never used for large text on light backgrounds (fails contrast) — use `fener-600`. Gündüz theme = `moon-100` canvas, `night-900` text, same accents; generated from the same tokens via CSS `light-dark()` / data-theme, never a second palette.

### 3.2 Typography (Turkish-first — every face verified for ş, ğ, ı/İ, ç, ö, ü before adoption)
| Role | Face | Why this one |
|---|---|---|
| Display (headlines, story titles) | **Fraunces** (variable; use the `SOFT`/optical axes at large sizes) | Storybook warmth without nostalgia-kitsch; its slightly wonky large-size forms read "hand-set fairy tale". Used with restraint: h1/h2 and story titles ONLY |
| UI body & controls | **Figtree** | Friendly geometric sans, complete Turkish set, excellent at 14–16px UI sizes |
| **Reading face (player page text)** | **Literata** (opsz axis) | A true book face designed for long-form screen reading — the player is a book, so it gets a book's typography. This role separation (UI sans / reading serif) is itself a design statement |
| Reading alternative (toggle) | **Lexend** | Reading-proficiency-optimized; offered as "Kolay okuma yazı tipi" in player settings (dyslexia-friendly, also great for early readers reading along) |

Type scale (px, mobile-first): 13 caption · 15 body · 17 body-lg/player-controls · 22 h3 · 28 h2 · 36 h1 · story title in player 30–40 fluid. Line-height 1.5 body, 1.65 player reading text. Weights: Figtree 400/600; Fraunces 500/650. No font-weight 300 anywhere (fails on cheap Android screens at night).

### 3.3 Illustration & imagery in the UI
- UI illustration style = simplified silhouette of the product's default art style (soft shapes, `haze`/`rose`/`fener` on night): used only in empty states, onboarding, and error moments. Never stock, never emoji-as-illustration.
- Real generated story art is always shown full-color, full-bleed, on `night-900` — the UI never puts colored chrome next to story art (it competes).
- Photography of real children appears ONLY where the user put it (their uploads); marketing surfaces use illustrated children, never stock kids (trust + KVKK optics).

### 3.4 Motion language
- Physics: gentle ease-out, 180–260 ms; nothing bounces (bedtime ≠ playground).
- One orchestrated moment per screen (per principle 5): hero glow bloom on landing; page-thumbnail "lights up" as each page finishes generating; the page-turn in the player (a soft 3D curl, 320 ms, with a faint paper sound — sound off by default outside the player).
- `prefers-reduced-motion`: page-turn becomes crossfade; progress animations become static states with text. Honored everywhere, tested in CI (Playwright emulation).

### 3.5 Voice & tone (Turkish microcopy register)
- Warm, plain, second-person "sen" (parent-to-parent warmth; "siz" only in legal/billing surfaces).
- The interface speaks like a kind librarian: short sentences, no exclamation inflation, no "AI/yapay zeka teknolojisi" jargon in-app (the magic word is "masal", not "model").
- The masal formulaic register is reserved as seasoning in exactly three places: landing hero ("Bir varmış, bir yokmuş… bu sefer kahraman senin çocuğun."), the progress screen stage names, and the story-complete moment. Everywhere else: functional clarity.
- Full microcopy rulebook in §12.

---

## 4. Design Tokens → Code (contract with `apps/web`)
- Single source: `packages/ui/tokens.css` — CSS custom properties (`--color-night-900`…), consumed by Tailwind 4 `@theme`. No raw hex anywhere in components (Biome grep rule: hex literals outside tokens.css fail CI).
- Spacing: 4px base scale (4/8/12/16/24/32/48/64). Radius: `r-sm 8px` inputs, `r-md 14px` cards, `r-lg 22px` sheets/modals, `r-full` pills — the generous radii carry the "soft storybook" feel; no 0-radius elements exist.
- Elevation: night theme uses **glow-borders instead of drop shadows** (1px `night-700`→`haze-400/20%` borders + subtle inner light); shadows read as mud on dark. Gündüz uses soft y-offset shadows.
- shadcn/ui is the component base, restyled entirely through the token theme; any shadcn default that survives visibly untouched (default ring color, default radius) is a review-reject.
- Icons: Lucide, 1.75px stroke, `moon-300` default — plus 6 custom brand glyphs only (fener/lantern, moon-book logo, page-flip, sleep-moon, star-credit, shield-heart for privacy).

---

## 5. Information Architecture & Navigation

### 5.1 Sitemap
```
PUBLIC (marketing, indexable)          APP (auth, noindex)
/            landing                   /app                    home = library
/masal/<konu> template SEO pages       /app/yeni               story creation wizard
/dinle/<token>  shared-story player    /app/karakterler        character library (M2 —
                                                               plan §2.2 character reuse)
/fiyatlar    pricing                   /app/karakter/yeni      character wizard
/gizlilik, /kosullar, /sss             /app/masal/<id>         story detail + player entry
/blog/*                                /app/masal/<id>/oynat   PLAYER (full-screen route)
                                       /app/hesap              account, credits, privacy center
```

### 5.2 Navigation model
- **App shell (mobile):** bottom tab bar, 3 tabs only — `Masallarım` (library/home) · `+ Yeni Masal` (center, fener-accented, raised) · `Hesap`. Characters live inside the creation flow and under Hesap; a 4th tab would dilute the single job.
- **Desktop:** same three destinations as a left rail; content column max-width 720px for forms, full-bleed for player/library grid. Desktop is a comfortable widening, never a different IA.
- **Player is a full-screen takeover route** (no tabs, no chrome) — entered explicitly, exited via a single top-left `✕`. It is the only full-screen surface in the app.
- Back behavior: browser back always safe (wizard steps are routed sub-steps with state preserved); no modal traps ever.

---

## 6. Screen Specifications

### 6.1 Landing page (`/`) — job: emotional proof in 5 seconds, one CTA
```
┌────────────────────────────────────┐
│  ☾ MasalAI            [Giriş yap] │   ← quiet header, no menu on mobile
│                                    │
│        ( fener glow )              │
│   ┌──────────────────────────┐     │
│   │  LIVE DEMO BOOK          │     │   ← a real generated story, auto-
│   │  (auto-plays muted,      │     │     playing page-turns w/ captions;
│   │   page-turning slowly)   │     │     tap = unmute & take over
│   └──────────────────────────┘     │
│  Bir varmış, bir yokmuş…           │   ← Fraunces display
│  Bu masalın kahramanı              │
│  senin çocuğun.                    │
│  [ İlk masalını ücretsiz oluştur ] │   ← single fener CTA
│  Fotoğrafını yükle → konusunu seç  │
│  → 10 sayfalık sesli masal.        │
│  ── nasıl çalışır (3 steps) ──     │
│  ── örnek masallar (3 covers) ──   │
│  ── güven bloğu: 🛡 fotoğraflar    │
│     masal hazır olunca silinir ──  │
│  ── fiyat özeti + SSS ──           │
└────────────────────────────────────┘
```
- **Hero thesis = the demo book itself** (a live artifact, not a claim). It's the single most persuasive object we own; everything else supports it.
- The trust block is above the fold on scroll-1 — for THIS product, privacy is a conversion feature, not footer text.
- No cookie-wall dark patterns; slim consent bar, reject as easy as accept.

### 6.2 Signup & consent — job: legal rigor that feels like care, not fear
- Steps: email/Google → single welcome screen → **consent screen** (the make-or-break UX moment):
  - Plain-language summary FIRST ("Fotoğrafı yalnızca karakteri çizmek için kullanırız; masal hazır olunca sileriz. Masalların sadece sana görünür."), each line with its shield-heart glyph; full KVKK/GDPR text behind "Detaylı metni oku" accordions.
  - Two separate, unbundled checkboxes: (1) ToS/KVKK aydınlatma acknowledgement, (2) explicit consent for child-photo processing. Marketing e-mail is a third, default-OFF, skippable toggle.
  - No pre-ticked boxes, no "kabul etmezsen olmaz" copy — the second checkbox explains what becomes unavailable instead ("işaretlemezsen fotoğrafsız, hazır karakterlerle masal oluşturabilirsin") → genuine choice, and a legitimate photo-less product path.
- 18+ attestation is one calm line, not an interstitial.

### 6.3 Character creation wizard (`/app/karakter/yeni`) — 4 routed steps, progress dots
1. **Kim?** — name (with live suffix preview: "Defne'nin masalı"), age, relation chips.
2. **Fotoğraf** — the trust-critical step:
   - Upload card shows inline do/don't photo tips as 4 tiny illustrated examples (front-facing / good light / no sunglasses / single child) BEFORE picking — teaching first prevents the worst churn driver (bad likeness).
   - After pick: auto face-detect crop suggestion, EXIF-strip note, and the **deletion promise chip** pinned to the photo: "🛡 Karakter onaylanınca bu fotoğraf silinir".
   - Moderation runs during upload; rejection uses §8.4 pattern (kind, specific, no blame).
3. **Tarz** — art style picker: 3–5 style cards, each showing THE SAME sample child rendered in that style (real comparability, not abstract swatches).
4. **Karakter kartı onayı** — the likeness moment: generated character sheet large on night canvas; two actions only: `Bu o! ✓` (fener) / `Tekrar dene (2 hakkın var)` (quiet). Below, one honest line: "Birebir kopya değil, masal dünyasındaki hali — kıyafet ve sahneler her masalda değişir." (expectation-setting copy measurably reduces regen loops).
   - On approve: a 900 ms micro-moment — the photo chip visibly dissolves with "Fotoğraf silindi ✓" (only if user kept default deletion). Trust, performed.

### 6.4 Story creation (`/app/yeni`) — one screen, three decisions, zero typing required
```
┌ Kahraman:  (Defne ✓) (+ ekle)      ┐  ← character chips
│ Konu:      [ serbest yaz…        ] │
│   öneriler: 🦷 diş fırçalama       │  ← template chips (from §9.6 library)
│             🌙 karanlık korkusu …  │
│ Kıssadan hisse: [ chips + serbest ]│
│ Ses: (Elif ▸ dinle)(Umut ▸ dinle)  │  ← 3-sec voice previews, mandatory listen UX
│ Dil: TR ▾    Tarz: (karttan mini)  │
│ [ ✨ Masalı oluştur — 1 kredi ]     │  ← cost ALWAYS on the button
└────────────────────────────────────┘
```
- Everything selectable by taps; typing is an enhancement. Credit cost lives on the button itself — never a surprise after.
- Advanced options (age band override, klasik kapanış toggle) behind a single quiet "İnce ayar" disclosure.

### 6.5 Generation progress — the wait is a stage (2–6 min)
```
        ( fener glow, small )
   "Defne'nin masalı dokunuyor…"
   ✓ Konu mayalandı            ← stage list, poetic names,
   ✓ Sayfalar yazıldı             checked as pipeline advances
   ◐ Resimler çiziliyor  3/10
   ○ Seslendirme
   ┌──┐┌──┐┌──┐┌▒▒┐┌  ┐┌  ┐      ← page thumbnails LIGHT UP live
   "Kapatabilirsin — hazır olunca
    haber veririz 🔔/✉"
```
- **Show the book being built**: title reveals first, then each finished page illustration pops in as a small thumbnail. Watching it assemble converts waiting into anticipation (and is inherently shareable).
- Leaving is first-class: push/e-mail notify, story continues server-side; returning users land here via a "hazırlanıyor" card in the library.
- Failure here follows §8.4 with automatic credit-refund messaging inline.

### 6.6 THE PLAYER (`/app/masal/<id>/oynat`) — the crown jewel
```
┌ ✕                        ⋮ (aA, ses, uyku) ┐
│                                            │
│         [ FULL-BLEED PAGE ART ]            │
│                                            │
│   Metin bandı (Literata, karaoke-highlight │
│   cümle cümle, scrim üzerinde)             │
│                                            │
│  ◀   ── page dots ──   ▶      ⏯           │
└────────────────────────────────────────────┘
```
- **Modes** (top-right sheet): `Dinle` (narrated, auto page-turn on audio end) · `Ben okuyorum` (silent, tap/swipe to turn, text larger) · `Uyku modu`.
- **Uyku modu is a designed ending, not a feature checkbox**: palette warms & dims 15%, UI chrome fades out entirely after 5 s, volume tapers over the final page, the fener glow contracts to darkness on the last word, then… nothing. No autoplay-next, no "bir masal daha!" prompt, no rating beg. The app helps the child sleep — that restraint IS the brand.
- Gestures: swipe = page (RTL-aware), tap left/right thirds = page, tap center = play/pause, swipe down = exit. All controls ≥48px; controls auto-hide after 3 s, any tap restores.
- Read-along: sentence-level highlight synced to TTS timestamps; `aA` sheet: text size (3 steps), Literata↔Lexend toggle, highlight on/off.
- Never a spinner inside the player: pages preload N+1/N+2 (plan §11.2); if a page image is late, a blurred low-res placeholder (stored blurhash) fades up — the story never stops for the network.
- Share/export live OUTSIDE the player on the story detail page — playing is sacred, undecorated.

### 6.7 Library (`/app`) — 2-col cover grid (3–4 desktop): cover, title, character chip, ▶ overlay. Top slot = in-progress card when a generation is running. Empty state: illustrated night sky + "İlk masalını oluştur" (fener) — an invitation, not an apology.

### 6.8 Billing & paywall — trust-preserving monetization
- Paywall appears only at natural moments (2nd story attempt) — never interrupts a playing story, never at bedtime mid-flow (if a wall would show 20:00–23:00 user-local during playback intent, defer to a morning e-mail nudge instead: a deliberate anti-dark-pattern rule).
- Pricing page: two sections — **Paketler** (3 credit-pack cards, per-story math shown: "12'li pakette masal başına ₺100" — figures always derived from plan §7.2, never hardcoded elsewhere) and **Abonelik** (Aile/Premium, lands with M3). All prices KDV-inclusive; gift framing on the 12-pack. Credits balance always visible in Hesap and on the create button.
- Cancel/refund paths are self-serve and 2 taps deep — findability of cancellation is a trust feature we advertise.

### 6.9 Hesap → Gizlilik Merkezi (privacy center — a product surface, not a settings graveyard)
One screen listing, with live states: each character's photo status ("silindi ✓ 12 Tem" / "saklanıyor — sil"), data export request, account deletion (with clear 2-step confirm and a promise receipt e-mail), consent history with dates. This screen is screenshot-able proof of our promises — design it like we expect users to share it.

---

## 7. Component Inventory (build order for Claude Code — all shadcn-based, token-themed)
`Button (fener/quiet/ghost, loading states) · Input+Field (label/help/error pattern) · Chip (selectable, w/ emoji-glyph slot) · Card (night elevation rules) · Sheet (bottom on mobile, the ONLY overlay primitive besides Dialog for destructive confirms) · Tabs-bar (app shell) · ProgressStages (§6.5) · PageThumbGrid · CoverCard · AudioPreviewChip (voice picker) · UploadCard (tips + moderation states) · ConsentBlock · CreditBadge · PromiseChip (🛡 deletion) · PlayerShell (page canvas, text band, controls, modes) · EmptyState (illustration + single CTA) · InlineAlert (§8 states)`
Storybook (or Ladle) is stood up in M1 with the first 8 components — visual regression via Playwright screenshots on the token theme.

---

## 8. States: the second half of every screen
### 8.1 Loading — skeletons shaped like real content (cover-shaped, text-line-shaped) in `night-800`; shimmer only in Gündüz (it glares at night). Never a full-screen spinner; the only "cinematic" wait is §6.5.
### 8.2 Empty — every empty state = 1 illustration + 1 sentence + 1 action. Library, characters, and history each have a designed one (inventory in Storybook).
### 8.3 Errors — pattern: what happened → what we did → what you can do. "Masal oluşturulamadı. Kredin iade edildi ✓. İstersen tekrar dene — genelde ikinci deneme sorunsuz geçer." Errors never apologize theatrically, never blame, never show codes (requestId behind a "destek için kopyala" link).
### 8.4 Moderation rejections — the highest-empathy copy in the app. Photo: "Bu fotoğrafla devam edemiyoruz. Çocuğunun net göründüğü, tek kişilik bir fotoğraf en iyi sonucu verir — bir başkasını deneyelim mi?" (specific, kind, forward-moving; never "içerik ihlali"). Topic: suggest the nearest safe alternative as chips.
### 8.5 Offline — library covers cached; player of a fully-generated story works offline if previously opened (manifest+assets in Cache Storage); creation flows show a gentle offline bar, never lose form state.

---

## 9. Accessibility & Inclusive Design (WCAG 2.2 AA floor, enforced)
- Contrast tokens pre-verified (§3.1); focus visible everywhere (2px `haze-400` ring — designed, not default); full keyboard path through wizard and player (arrow keys = pages, space = play/pause).
- Player: captions inherent; text-size control; Lexend toggle; reduced-motion crossfades; screen-reader page announcements ("Sayfa 3, 10 sayfadan"). Audio never autoplays with sound on route entry — explicit ⏯ starts narration (also prevents bedtime jump-scares at full volume).
- Touch targets ≥48px, thumb-zone primary actions (§1.3-4); form errors announced via aria-live; Turkish `lang` attributes correct for screen readers (İ/ı handling).
- Axe checks in Playwright for: auth, wizard, creation, player, billing (handbook §6.6 gate).

---

## 10. Performance as UX (budgets are design decisions)
- Landing LCP < 2.0 s (hero demo book poster first, video/animation lazy); app route TTI < 2.5 s mid-Android; player first-page-visible+audible < 2.5 s (plan §11.2).
- Images: AVIF/WebP, blurhash placeholders everywhere art appears; fonts: variable subsets w/ Turkish glyphs, `font-display: swap`, ≤ 3 families total (Fraunces, Figtree, Literata; Lexend loads on demand).
- Interaction feedback ≤ 100 ms rule: every tap gets an immediate visual response even when the action is async (optimistic chip selection, button spinners-in-place).

---

## 11. Trust & Privacy UX patterns (the differentiator, systematized)
1. **PromiseChip** on any surface holding a real photo (🛡 + deletion state) — the promise travels with the artifact.
2. **Performed deletion** (§6.3 dissolve moment) — never delete silently; show it.
3. **Private-by-default badges** on stories ("Sadece sen" / "Bağlantıya sahip olanlar, 7 gün"), share sheets state expiry explicitly.
4. **Gizlilik Merkezi** (§6.9) as a first-class destination in Hesap.
5. **No dark patterns, as policy**: no countdown timers on offers, no confirm-shaming ("Hayır, çocuğumu sevmiyorum" style copy is fireable), no pre-ticked boxes, cancellation ≤ 2 taps. Codified here so it's reviewable in PRs.

---

## 12. Content Design Rulebook (TR)
- Buttons: verb-first, outcome-named, cost-transparent ("Masalı oluştur — 1 kredi", "Karakteri kaydet"); the same action keeps the same name through the flow and its toast ("Oluştur" → "Masalın hazırlanıyor").
- Sentence case everywhere; no ALL CAPS except logo; numerals for numbers ("10 sayfa").
- "Sen" in app, "siz" in legal/billing; child referred to by chosen name wherever known ("Defne'nin masalı hazır!") — personalization is our product; the UI copy performs it too.
- Emotional register budget: masal-formula language ONLY in the three sanctioned places (§3.5); errors and money are always plain.
- Terminology dictionary (binding): masal (never "hikaye" for the product unit) · karakter kartı · kıssadan hisse · kredi · Uyku modu · Gizlilik Merkezi. Claude Code adds new user-facing terms here BEFORE using them.
- All strings in next-intl catalogs from day one; keys named by function (`player.sleepMode.title`), never by content.

---

## 13. Research & Validation Plan
- **Beta blitz (Days 8–9, compressed):** 3 remote moderated sessions during the founding beta; the full 5-session evening-context study runs in weeks 3–4 before the Product Hunt moment (sprint trade-off: launch first, deep-study second — instrumentation covers the gap). Tasks = create character from a real photo → create story → play in the dark → find the deletion proof. Success metrics: task completion, likeness-approval on ≤2 attempts, SEQ ≥ 5.5, and the qualitative "would you play this for your child tonight?".
- **Beta instrumentation (PostHog, §12.1 of plan):** funnel drop-offs per wizard step, voice-preview usage, regen counts, player completion %, sleep-mode adoption, time-to-first-story.
- **Standing UX metrics:** likeness-satisfaction (approve on 1st sheet ≥ 70%), player completion ≥ 80%, paywall→purchase without support tickets, zero rage-tap hotspots (session heatmap on marketing pages only).
- Copy A/B is allowed on marketing surfaces; NEVER on consent, pricing math, or privacy copy (those optimize for clarity, not conversion).

---

## 14. Handoff & Build Order (maps to milestones)
- **S0 (Day 1):** nothing user-facing — placeholder pages only (kickoff scope). `packages/ui` is scaffolded empty.
- **S1 (Days 2–5, first step of stream C):** `packages/ui` with tokens.css + Tailwind theme + Button/Input/Card/Chip + both themes wired (night default); then wizard components, UploadCard with all moderation states, ProgressStages + live thumbnails, PlayerShell v1 (Dinle mode, read-along), EmptyStates. Storybook up.
- **S2 + beta (Days 6–9):** player modes (Ben okuyorum, Uyku), aA sheet, library polish, error/refund surfaces, share sheet, PromiseChip system complete.
- **Launch window (Days 10–14):** billing surfaces, Gizlilik Merkezi, landing + template SEO pages, Gündüz theme QA pass.
- Design QA gate in DoD: screenshot on a real phone **at night brightness**; any screen that glares fails review.
- This document is living: implemented screens get a `✅ built <PR#>` marker on their section header; divergences require updating the spec in the same PR (Doc-Touch Matrix).
