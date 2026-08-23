# MAP

MAP is a private, local-first life planning app. It keeps long-term goals,
semester schedules, job applications, everyday tasks, nutrition checks, and
workouts in one place.

## Data and privacy

All personal records are stored in the browser with `localStorage`. There is no
account, external database, or analytics service. Use **Export backup** in the
sidebar to save a JSON copy before clearing browser data or changing computers.

The optional MAP AI panel sends the instruction and current plan data to the
OpenAI Responses API only when the user presses **Generate preview**. Its API
key stays in a local or hosted runtime secret and is never sent to the browser.
Every proposed data change requires confirmation before it is applied.

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and set `OPENAI_API_KEY` to enable MAP AI in
local development. Never commit `.env.local`.

Open `http://localhost:3000`.

## Build

```bash
npm run build
```
