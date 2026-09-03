# MAP

MAP is a private, offline-first life planning app. It keeps long-term goals,
semester schedules, job applications, everyday tasks, notes, meals, shopping,
nutrition checks, and workouts in one place.

## Data and privacy

The browser keeps a complete offline copy and the private hosted app syncs
ordinary MAP records through D1 after ChatGPT authentication. Private reference
notes stay device-only unless their owner explicitly enables **AI-readable ·
cloud sync**. Use **Export backup** to keep a portable JSON copy.

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

## Chrome extension

The [`extension`](./extension) folder contains **MAP Job Capture**, a private
Manifest V3 extension that reads the currently open LinkedIn job only after a
toolbar click. It sends an editable draft to MAP; MAP never saves it until the
user confirms the preview.

Installation and usage instructions are in
[`extension/README.md`](./extension/README.md).

## Build

```bash
npm run build
```
