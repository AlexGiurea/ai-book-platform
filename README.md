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
- Local in-memory project store for fast prototyping.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Framer Motion
- OpenAI Node SDK
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
npm run test:cover-image
```

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes | OpenAI API key used by the planning, writing, and image agents. |
| `OPENAI_FREE_MODEL` | No | Free-tier text model. Defaults to `gpt-5.4-mini`. |
| `OPENAI_PRO_MODEL` | No | Pro-tier text model. Defaults to `gpt-5.5`. |
| `OPENAI_MODEL` | No | Legacy fallback for the Pro tier when `OPENAI_PRO_MODEL` is not set. |
| `OPENAI_IMAGE_MODEL` | No | Image model used for cover generation. Defaults to `gpt-image-2`. |
| `DATABASE_URL` | Yes for persistence | Neon Postgres connection string used for durable projects, batches, events, and jobs. |
| `BLOB_READ_WRITE_TOKEN` | Yes for persistent covers | Vercel Blob token used to persist generated cover images. |

## Persistent Storage

Run the database migration after connecting Neon:

```bash
npm run db:migrate
```

Generated book projects are stored in Neon Postgres. Cover images are uploaded to Vercel Blob when `BLOB_READ_WRITE_TOKEN` is present. Without storage environment variables, the app falls back to local in-memory/file storage for development only.

Long-running generation is split into durable jobs stored in Postgres. The `/api/jobs/run` endpoint processes one job unit at a time. The app also kicks this endpoint while a user is watching generation progress, and `vercel.json` includes a Hobby-compatible daily safety sweep. For unattended minute-by-minute processing after a browser tab closes, use Vercel Pro Cron or an external scheduler to call `/api/jobs/run`.

## Deployment

The project is configured for Vercel. Set the same environment variables in Vercel before deploying.

```bash
npx vercel
```

For production:

```bash
npx vercel --prod
```
