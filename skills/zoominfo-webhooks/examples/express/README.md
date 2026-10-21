# ZoomInfo Webhooks - Express Example

Minimal example of receiving ZoomInfo webhooks and checking the `x-zoominfo-token` verification token. ZoomInfo does not sign payloads.

## Prerequisites

- Node.js 18+
- ZoomInfo Enterprise API access with the Scaling API (required for the Monitoring API / webhooks)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Create the webhook in ZoomInfo (Admin Portal > Integrations > API & Webhooks > Create New) and click **Validate**. The Validate step posts a sample payload **before a token exists**, so leave `ZOOMINFO_WEBHOOK_TOKEN` unset for this step; the example acknowledges the request without processing it.

4. Click **Generate New Token**, put the token in `.env` as `ZOOMINFO_WEBHOOK_TOKEN`, restart the server, then switch the webhook's Activation Status to ON.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

To receive real ZoomInfo deliveries locally, use the Hookdeck CLI (no install or account needed):

```bash
npx hookdeck-cli listen 3000 zoominfo --path /webhooks/zoominfo
```

Use the URL it prints as the webhook's Target URL in ZoomInfo.

## Endpoint

`POST /webhooks/zoominfo` returns `200` for a valid token, `401` for a missing or wrong token, and `400` for invalid JSON.
