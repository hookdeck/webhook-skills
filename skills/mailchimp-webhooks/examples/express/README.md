# Mailchimp Webhooks - Express Example

Minimal example of receiving Mailchimp webhooks with Express. Mailchimp does
**not** sign webhooks, so this endpoint is secured with an unguessable secret in
the URL query string (validated with a timing-safe comparison) and answers
Mailchimp's `GET` URL-validation ping with `200`.

## Prerequisites

- Node.js 18+
- A Mailchimp audience and a webhook URL secret you generate yourself

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `MAILCHIMP_WEBHOOK_SECRET` in `.env` to a long random string
   (`openssl rand -hex 32`). You will append it to the webhook URL you register
   in Mailchimp.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

- URL validation: `GET  http://localhost:3000/webhooks/mailchimp` → `200`
- Event delivery: `POST http://localhost:3000/webhooks/mailchimp?secret=...`

## Local Development

Tunnel public webhooks to your local server with the Hookdeck CLI (no account
required):

```bash
npx hookdeck-cli listen 3000 mailchimp --path /webhooks/mailchimp
```

Register the resulting URL in Mailchimp with your secret appended:
`https://<tunnel-host>/webhooks/mailchimp?secret=<MAILCHIMP_WEBHOOK_SECRET>`

## Test

```bash
npm test
```

The tests build real form-encoded Mailchimp payloads, exercise the GET URL
validation, and verify secret checking for every event type
(`subscribe`, `unsubscribe`, `profile`, `upemail`, `cleaned`, `campaign`).
