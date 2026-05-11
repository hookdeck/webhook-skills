# Gemini Webhooks - Express Example

Minimal example of receiving Google Gemini API webhooks with Standard Webhooks
signature verification.

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
   cp .env.example .env
   ```

3. Add your Gemini webhook signing secret to `.env`:
   - Register a webhook via the Gemini WebhookService API (see the skill's
     `references/setup.md`).
   - The API returns a `whsec_…` value only once — paste it here.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test with Hookdeck CLI

```bash
# No account required
npx hookdeck-cli listen 3000 gemini --path /webhooks/gemini
```

Then register the public URL Hookdeck prints as your webhook endpoint with Gemini.

## Test

Run the test suite:

```bash
npm test
```

## Endpoints

- `POST /webhooks/gemini` — Webhook receiver endpoint
- `GET /health` — Health check endpoint

## Events Handled

- `batch.succeeded` / `batch.failed` / `batch.cancelled` / `batch.expired`
- `video.generated`
- `interaction.completed` / `interaction.requires_action` / `interaction.failed` / `interaction.cancelled`
