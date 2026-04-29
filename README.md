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

Add your OpenAI API key:

```bash
OPENAI_API_KEY=your_openai_api_key
OPENAI_FREE_MODEL=gpt-5.4-mini
OPENAI_PRO_MODEL=gpt-5.5
OPENAI_IMAGE_MODEL=gpt-image-2
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
| `OPENAI_FREE_MODEL` | No | Free-tier text model. Defaults to `gpt-5.4-mini`. |
| `OPENAI_PRO_MODEL` | No | Pro-tier text model. Defaults to `gpt-5.5`. |
| `OPENAI_MODEL` | No | Legacy fallback for the Pro tier when `OPENAI_PRO_MODEL` is not set. |
| `OPENAI_IMAGE_MODEL` | No | Image model used for cover generation. Defaults to `gpt-image-2`. |
| `FOLIO_OWNER_EMAILS` | No | Comma-separated email allowlist that receives Pro without Stripe. Use this for owner and beta accounts before billing launches. |
| `DATABASE_URL` | Yes for persistence | Neon Postgres connection string used for durable projects, batches, events, and jobs. |
| `BLOB_READ_WRITE_TOKEN` | Yes for persistent covers | Vercel Blob token used to persist generated cover images. |
| `NOTION_API_KEY` | No | Optional Notion internal integration token for syncing generated book metadata. |
| `NOTION_BOOKS_DATABASE_ID` | No | Optional Notion database ID for the Folio Book Projects mirror. Current workspace database: `08d8fb40c86d4420b2196876e4baa6a5`. |
| `STRIPE_SECRET_KEY` | No until billing test | Stripe secret key used by Checkout and the customer portal. |
| `STRIPE_WEBHOOK_SECRET` | No until billing test | Signing secret for `/api/billing/webhook`. |
| `STRIPE_PRO_PRICE_ID` | No until billing test | Stripe recurring Price ID for the Pro plan. |
| `NEXT_PUBLIC_APP_URL` | Recommended for billing | Public app URL used for Checkout and Portal redirects. |

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
