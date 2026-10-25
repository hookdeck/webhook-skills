# athenahealth Webhooks - Express Example

Minimal example of receiving athenahealth FHIR Subscription notifications with signature verification.

## Prerequisites

- Node.js 18+
- athenahealth Event Subscription Platform access and a FHIR Subscription created with an `X-Hub-Secret` header

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `ATHENAHEALTH_WEBHOOK_SECRET` in `.env` to the same value you sent as the `X-Hub-Secret` header when creating the Subscription. Without that header, athenahealth sends unsigned notifications.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 athenahealth --path /webhooks/athenahealth
```

Then create a Subscription (`POST /fhir/r4/Subscription`) whose `channel.endpoint` is the Hookdeck URL, for a topic such as `Appointment.schedule`.

## Endpoint

- `POST /webhooks/athenahealth` - Receives and verifies athenahealth notification Bundles (`X-Hub-Signature`, `sha256=<hex>`). The raw body is read with `express.raw({ type: '*/*' })` so any content type verifies. Only the `sha256` method is accepted: if athenahealth changes the method, verification fails until you add support for it.
