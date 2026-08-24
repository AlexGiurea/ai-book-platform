# Folio

Folio is an AI book-writing platform that turns a rough idea, outline, or creative brief into a structured, illustrated book workflow.

The app guides a project from idea capture through planning, approval, drafting, cover generation, and reading. It is built with Next.js, React, Tailwind CSS, Framer Motion, and the OpenAI API.

## Live App

Vercel deployment: [https://ai-book-platform-34otkfc6w-alex-giureas-projects.vercel.app](https://ai-book-platform-34otkfc6w-alex-giureas-projects.vercel.app)

## Features

- Idea-to-book creation flow with genre, tone, length, point-of-view, and image-style preferences.
- Planning agent that builds a story bible before drafting starts.
- Approval gate so the plan can be reviewed before the writing agent continues.
- Batch-based chapter drafting with project status tracking.
- AI cover generation support.
- Dashboard and reader views for managing and reading generated projects.
- Free and Pro account tiers with plan-aware model selection and export gates.
- Stripe Billing foundation for Checkout, customer portal, webhooks, and subscription state sync.
- Optional Notion mirror that upserts generated book projects into a Folio Book Projects database.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Framer Motion
- OpenAI Node SDK
- Stripe Node SDK
- Zod

## Getting Started

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.local.example .env.local
```

Add your OpenAI API key (role models default to pipeline v3 Literary routing):

```bash
OPENAI_API_KEY=your_openai_api_key
# Optional overrides — blank strings are ignored (safe with empty Vercel envs)
# OPENAI_PLANNER_MODEL=gpt-5.6-sol
# OPENAI_WRITER_MODEL_PRO=gpt-5.6-sol
# OPENAI_IMAGE_MODEL=gpt-image-2
FOLIO_OWNER_EMAILS=you@example.com
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm test
npm run db:migrate
npm run notion:sync-books
npm run test:cover-image
```

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes | OpenAI API key used by the planning, writing, and image agents. |
| `OPENAI_PROJECT_ID` | No | OpenAI [project](https://platform.openai.com/settings/organization) ID (starts with `proj_`). If omitted, usage may appear under your organization’s default project. Set this to your AI Book-Writing project so all Folio API calls are attributed there. |
| `JOB_RUNNER_SECRET` | Recommended for production | Long random bearer token required for unauthenticated cron or external scheduler calls to `/api/jobs/run`. Signed-in browser calls are scoped to the current user’s own queued jobs. |
| `OPENAI_PLANNER_MODEL` | No | Planner (Sol). Default `gpt-5.6-sol`. |
| `OPENAI_PLAN_AUDITOR_MODEL` | No | Plan auditor (Terra). Default `gpt-5.6-terra`. |
| `OPENAI_BOOK_AUDITOR_MODEL` | No | Whole-book auditor. Default `gpt-5.6-sol` — this pass reads the finished manuscript and decides whether the book works, so it runs on the strongest model. |
| `OPENAI_WRITER_MODEL_FREE` | No | Free writer. Default `gpt-5.6-luna`. |
| `OPENAI_WRITER_MODEL_PRO` | No | Pro writer (Literary Sol). Default `gpt-5.6-sol`. Set to `gpt-5.6-terra` for optional Balanced Pro. |
| `OPENAI_CRITIC_MODEL` | No | Chapter critic. Default `gpt-5.6-terra`. |
| `OPENAI_REVISE_MODEL_FREE` | No | Free reviser. Default `gpt-5.6-luna`. |
| `OPENAI_REVISE_MODEL_PRO` | No | Pro reviser. Default `gpt-5.6-sol` (stays Sol even if writer is Terra). |
| `OPENAI_REVISION_VERIFIER_MODEL` | No | Post-revise verifier. Default `gpt-5.6-luna`. |
| `OPENAI_FREE_MODEL` / `OPENAI_PRO_MODEL` / `OPENAI_MODEL` | No | Legacy writer fallbacks (blank-safe). Prefer role-specific vars. |
| `OPENAI_IMAGE_MODEL` | No | Cover image model. Default `gpt-image-2`. |
| `FOLIO_WRITER_CONTEXT_TOKEN_BUDGET` | No | Ceiling on prose tokens fed to the writer. Default `400000` — above every length preset, so it is a guard rail, not part of the normal path. |
| `FOLIO_OWNER_EMAILS` | No | Comma-separated email allowlist that receives Pro without Stripe. Use this for owner and beta accounts before billing launches. |
| `DATABASE_URL` | Yes for persistence | Neon Postgres connection string used for durable projects, batches, events, and jobs. |
| `BLOB_READ_WRITE_TOKEN` | Yes for persistent covers | Vercel Blob token used to persist generated cover images. |
| `NOTION_API_KEY` | No | Optional Notion internal integration token for syncing generated book metadata. |
| `NOTION_BOOKS_DATABASE_ID` | No | Optional Notion database ID for the Folio Book Projects mirror. Current workspace database: `08d8fb40c86d4420b2196876e4baa6a5`. |
| `STRIPE_SECRET_KEY` | No until billing test | Stripe secret key used by Checkout and the customer portal. |
| `STRIPE_WEBHOOK_SECRET` | No until billing test | Signing secret for `/api/billing/webhook`. |
| `STRIPE_PRO_PRICE_ID` | No until billing test | Stripe recurring Price ID for the Pro plan. |
| `NEXT_PUBLIC_APP_URL` | Recommended for billing | Public app URL used for Checkout and Portal redirects. |

**Blank env safety:** empty or whitespace-only values are treated as unset, so blank Vercel env vars no longer override defaults.

## Pipeline v3 model configuration

Generation uses **pipeline version `v3`**. Role models and the pipeline version are **snapshotted** onto each project at `createProject` (`projects.pipeline_version`, `projects.model_config`). Agents always read the snapshot — mid-deploy env changes do not mix models inside an in-flight book.

| Role | Default | Env override |
| --- | --- | --- |
| planner | `gpt-5.6-sol` | `OPENAI_PLANNER_MODEL` |
| plan_auditor | `gpt-5.6-terra` | `OPENAI_PLAN_AUDITOR_MODEL` |
| book_auditor | `gpt-5.6-sol` | `OPENAI_BOOK_AUDITOR_MODEL` |
| writer (Free) | `gpt-5.6-luna` | `OPENAI_WRITER_MODEL_FREE` → legacy `OPENAI_FREE_MODEL` |
| writer (Pro Literary) | `gpt-5.6-sol` | `OPENAI_WRITER_MODEL_PRO` → legacy `OPENAI_PRO_MODEL` / `OPENAI_MODEL` |
| critic | `gpt-5.6-terra` | `OPENAI_CRITIC_MODEL` |
| revise (Free) | `gpt-5.6-luna` | `OPENAI_REVISE_MODEL_FREE` |
| revise (Pro) | `gpt-5.6-sol` | `OPENAI_REVISE_MODEL_PRO` |
| revision_verifier | `gpt-5.6-luna` | `OPENAI_REVISION_VERIFIER_MODEL` |
| cover | `gpt-image-2` | `OPENAI_IMAGE_MODEL` |

**Literary (default Pro):** writer + reviser Sol. **Balanced (optional):** set only `OPENAI_WRITER_MODEL_PRO=gpt-5.6-terra` while leaving `OPENAI_REVISE_MODEL_PRO` at Sol.

### Job flow

`plan` → (`plan_batches`…)? → `plan_audit` → (`plan_repair` → `plan_audit:2`)? → `awaiting_approval` → `write:N` → (chapter close) `critique` → (`revise` → `verify_revision`)? → next `write` → (last chapter) `book_audit` → (`book_repair` ...)? → `complete`. Cover runs in parallel after approval.

### Whole-book audit

Every check before this one is chapter-local: the critic sees one chapter, the
verifier one batch. Nothing asked whether the *book* worked, so a thread planted
in act one and never paid off shipped without anything noticing.

After the last chapter, `book_audit` runs two halves:

- **Free.** The deterministic checks from the quality harness — thread
  resolution against the ledger, planned characters who never reach the page.
  Their findings are handed to the model half as established fact rather than
  left for it to notice.
- **Paid, once.** One pass over the full manuscript on `book_auditor`
  (`gpt-5.6-sol`), about $0.23 — the manuscript is a cached prefix by then, so
  the read is mostly discounted and only the verdict pays output rates.

Issues must name a batch and be fixable by rewriting that single batch; the
auditor is told to say pass rather than manufacture work, because every repair
rewrites a batch that currently reads fine. Repairs run one at a time, capped at
`MAX_BOOK_REPAIRS` (5), deduplicated per batch, severe before moderate.

**A failed audit or repair never fails the project.** The manuscript already
exists at that point, so both stages classify as `finish_book` — the book ships
as written. Only stages that run before any prose exists (`plan`, `write`) can
hard-fail.

### Length discipline

Measured across every finished book, batches ran ~3,880 words against a 2,800
target — a 32-38% overrun. Batch count is fixed at project creation, so nothing
absorbed the excess: a book ordered at 120,000 words arrived at ~162,000 and
cost a third more than the preset implied.

Two mechanisms now hold the line, both in the prompt and neither costing a call:

- **A hard range, not a soft target.** Each batch is given a target, an
  acceptable range, and an explicit ceiling.
- **Cumulative drift correction.** The per-batch target is recomputed from what
  is actually left to write (`remaining words / remaining batches`), so an
  overlong chapter is repaid by the ones after it instead of compounding. The
  correction is clamped to 0.75x-1.1x of the blueprint figure, because an
  unclamped correction would demand a 900-word batch and wreck the chapter.

There is deliberately **no retry-on-overlong** — a rewrite costs a full write
call. Run `npm run quality:score` after the next generation and read the
per-batch length check; add machinery only if the prompt change was not enough.

### Writer context and prompt caching

The writer receives the **entire manuscript written so far**, in full. A finished
162,000-word book is roughly 216,000 tokens against a 1,050,000-token window, so
it fits comfortably, and it is what lifted the judge's continuity score from 64
to 82 on the first measured comparison.

**It is not free, and an earlier version of this document claimed it was.**
Measured against the live API:

- Only the **`instructions`** field participates in prompt caching.
- It caches only on an **exact byte match**. A growing `instructions` caches
  nothing: a manuscript appended across four calls returned `cached=0` every time.
- The **`input`** field never caches, in any shape — plain string or message
  array, with or without `prompt_cache_key`. `prompt_cache_key` made no
  measurable difference at all.
- On GPT-5.6, cache **writes** cost **1.25x** uncached input, so content written
  to a cache that never hits is billed at a 25% premium.

There is therefore **no append-only-prefix discount on this API**. The consequence:

- Everything byte-identical across a project's writer calls — the craft rules,
  the blueprint canon, the user's idea — lives in `buildWriterSystemPrompt()` so
  it caches. **Do not interpolate anything per-batch into that function.**
- The manuscript is re-read at full price on every call. That is the real,
  unavoidable cost of full-manuscript continuity, and it grows quadratically with
  batch count: ~315,000 redundant input tokens across a 14-batch book.

The single biggest lever on that cost is **fewer, larger writer calls**. Writing a
chapter per call instead of a batch cuts redundant manuscript re-reads by roughly
70%, because the manuscript is re-sent once per call regardless of call size.

Watch `cached_input_tokens` via `npm run quality:score`. Expect it to equal the
instructions block and no more; if it drops below that, something per-batch has
leaked into `instructions`.

### Length discipline

Measured across every finished book, batches ran ~3,880 words against a 2,800
target — a 32-38% overrun. Batch count is fixed at project creation, so nothing
absorbed the excess: a book ordered at 120,000 words arrived at ~162,000 and
cost a third more than the preset implied.

Two mechanisms now hold the line, both in the prompt and neither costing a call:

- **A hard range, not a soft target.** Each batch is given a target, an
  acceptable range, and an explicit ceiling.
- **Cumulative drift correction.** The per-batch target is recomputed from what
  is actually left to write (`remaining words / remaining batches`), so an
  overlong chapter is repaid by the ones after it instead of compounding. The
  correction is clamped to 0.75x-1.1x of the blueprint figure, because an
  unclamped correction would demand a 900-word batch and wreck the chapter.

There is deliberately **no retry-on-overlong** — a rewrite costs a full write
call. Run `npm run quality:score` after the next generation and read the
per-batch length check; add machinery only if the prompt change was not enough.

### Writer context

The writer receives the **entire manuscript written so far**, in full, not a
rolling window of summaries. A finished 162,000-word book is roughly 216,000
tokens against a 1,050,000-token window, so it fits comfortably.

This is cheap only because the manuscript is **append-only**: the call for batch
N sees batches 1..N-1, and the call for batch N+1 sees exactly those bytes plus
one more. That makes it an ideal prompt-cache prefix — 90% off on reads, with
only the newest batch paying the write premium. The prompt therefore orders
sections stable-first: blueprint, user idea, manuscript, *then* everything that
varies per call (story state, this batch's blueprint, progress). **Moving any
per-call section above the manuscript ends the cache prefix early and collapses
the cache hit rate** — there is a test pinning the ordering.

If prose ever exceeds `FOLIO_WRITER_CONTEXT_TOKEN_BUDGET`, the oldest batches
drop to summaries. The cut advances in blocks of 8 rather than one batch at a
time, so the surviving range stays byte-identical across several consecutive
calls instead of invalidating the cache on every one.

Watch `cached_input_tokens` in `llm_usage` (surfaced by `npm run quality:score`).
If it is not climbing run over run, the prefix is being invalidated and this
design is costing money rather than saving it.

The critic reads the **complete chapter** and the verifier the **complete revised batch** — both sampled excerpts before, which hid most of the text. When the verifier reports the fix did not land, the batch gets **exactly one more revision attempt** (`MAX_REVISION_ATTEMPTS = 2`) targeting the remaining issues, then ships regardless. Retry jobs carry an `a2` key suffix; attempt 1 keeps the unsuffixed key so in-flight books are unaffected.

### Prompt caching / billing caveat (GPT-5.6)

Calls set a stable `prompt_cache_key` scoped by project + role + config hash. Writer prompts keep a stable canon prefix before dynamic batch content. OpenAI SDK 6.34 does **not** expose explicit `prompt_cache_options` breakpoints — caching relies on key + prefix ordering.

GPT-5.6 cache **writes** are billed at **1.25×** input; cache **reads** are typically a **~90% discount**. Usage rows record `cache_write_tokens` when the API returns them.

### Migration / deployment

1. Deploy code that includes blank-safe model resolution and snapshots.
2. Run `npm run db:migrate` against Neon (adds `pipeline_version`, `model_config`, `dedupe_key`, `state_delta`, `last_revision_key`, `cache_write_tokens`, etc.).
3. Do **not** rely on empty Vercel `OPENAI_*` strings — leave unset or set real model IDs.
4. Existing projects without `model_config` get a deterministic normalized config on read.

## Quality Harness

A benchmark for the generation pipeline. Deterministic checks are free; the
whole-book judge is the only part that costs money.

```bash
npm run quality:score -- --all                      # free checks, every finished book
npm run quality:score -- --latest                   # free checks, most recent book
npm run quality:score -- --project <id> --judge     # adds one whole-book judge call
npm run quality:score -- --project <id> --judge --judge-model claude-opus-5
```

Results are written to `quality-runs/*.json` and are **meant to be committed** —
the value is the trend line. Re-running the same book against a newer model is
how you measure whether the pipeline actually improved.

**Deterministic checks** (`src/lib/quality/manuscript-checks.ts`, no model calls):
total and per-batch length adherence, planted-thread resolution against the v3
thread ledger, planned characters who never reach the page, em-dash ban
compliance, distinctive-phrase reuse, and chapter length balance.

**Judge** (`src/lib/quality/judge.ts`): one call reading the entire manuscript,
scoring prose, continuity, structure, voice, and payoff, plus concrete
chapter-cited issues. Costs about $0.78 on Sol for an 80,000-word book. The
rubric is frozen and versioned (`RUBRIC_VERSION`) — scores are only comparable
within a version, so bump it when the wording changes.

**Pricing** (`src/lib/quality/pricing.ts`): list prices per model, with
`PRICING_VERIFIED_ON` recording when they were last checked. Note that
`cached_input_tokens` and `cache_write_tokens` are *subsets* of `input_tokens`
in the Responses API — billing them on top of the full input overstates a
cold-cache call by roughly 40%.

## Billing Foundation

Billing is prepared but intentionally not launched. New accounts default to Free unless their email is included in `FOLIO_OWNER_EMAILS`. Pro unlocks longer generation lengths, multiple generated books, and export endpoints.

When ready to test Stripe:

1. Create a recurring Pro Price in Stripe.
2. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, and `NEXT_PUBLIC_APP_URL`.
3. Point Stripe webhooks at `/api/billing/webhook`.
4. Listen for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.
5. Run `npm run db:migrate`.

## Persistent Storage

Run the database migration after connecting Neon:

```bash
npm run db:migrate
```

Generated book projects are stored in Neon Postgres. Cover images are uploaded to Vercel Blob when `BLOB_READ_WRITE_TOKEN` is present. Without storage environment variables, the app falls back to local in-memory/file storage for development only.

Long-running generation is split into durable jobs stored in Postgres. The `/api/jobs/run` endpoint processes one job unit at a time. The app also kicks this endpoint while a user is watching generation progress, and `vercel.json` includes a Hobby-compatible daily safety sweep. For unattended minute-by-minute processing after a browser tab closes, use Vercel Pro Cron or an external scheduler to call `/api/jobs/run`.

## Notion Book Mirror

The Notion database `Folio Book Projects` lives under the AI Book-Writing Platform page. Set `NOTION_API_KEY` and `NOTION_BOOKS_DATABASE_ID` to enable automatic upserts whenever a book project is created, planned, written, completed, or receives a cover.

Backfill or repair the Notion mirror from Neon:

```bash
npm run notion:sync-books
```

## Deployment

The project is configured for Vercel. Set the same environment variables in Vercel before deploying.

```bash
npx vercel
```

For production:

```bash
npx vercel --prod
```
