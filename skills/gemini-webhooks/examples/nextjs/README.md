# Gemini Webhooks - Next.js Example

Next.js App Router example for receiving Google Gemini API webhooks with Standard
Webhooks signature verification.

## Prerequisites

- Node.js 18+
- A Gemini API project with a registered webhook (you'll get a `whsec_…` signing secret)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Gemini webhook signing secret to `.env.local`:
   - Register a webhook via the Gemini WebhookService API (see the skill's
     `references/setup.md`).
   - The API returns a `whsec_…` value only once — paste it here.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test with Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 gemini --path /webhooks/gemini
```

Then register the Hookdeck-generated public URL with Gemini as your webhook endpoint.

## Test

```bash
npm test
```

## API Routes

- `POST /webhooks/gemini` — Webhook receiver endpoint

## Events Handled

- `batch.succeeded` / `batch.failed` / `batch.cancelled` / `batch.expired`
- `video.generated`
- `interaction.completed` / `interaction.requires_action` / `interaction.failed` / `interaction.cancelled`
