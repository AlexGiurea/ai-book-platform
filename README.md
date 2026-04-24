# Folio

Folio is an AI book-writing platform that turns a rough idea, outline, or creative brief into a structured, illustrated book workflow.

The app guides a project from idea capture through planning, approval, drafting, cover generation, and reading. It is built with Next.js, React, Tailwind CSS, Framer Motion, and the OpenAI API.

## Live App

Vercel deployment: _pending_

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
OPENAI_MODEL=gpt-5.1
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
npm run test:cover-image
```

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes | OpenAI API key used by the planning, writing, and image agents. |
| `OPENAI_MODEL` | No | Text model used for book planning and writing. Defaults to `gpt-5.1`. |
| `OPENAI_IMAGE_MODEL` | No | Image model used for cover generation. Defaults to `gpt-image-2`. |

## Deployment

The project is configured for Vercel. Set the same environment variables in Vercel before deploying.

```bash
npx vercel
```

For production:

```bash
npx vercel --prod
```
