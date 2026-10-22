# Terraform Webhooks - Express Example

Minimal example of receiving HCP Terraform (Terraform Cloud) and Terraform Enterprise
notification webhooks with `X-TFE-Notification-Signature` verification.

## Prerequisites

- Node.js 18+
- An HCP Terraform or Terraform Enterprise workspace with admin access
- A notification configuration (generic destination) with a **token**

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `TERRAFORM_NOTIFICATION_TOKEN` in `.env` to the token you will enter on the
   notification configuration (it can't be viewed after saving).

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 terraform --path /webhooks/terraform
```

Use the public URL it prints as the **Webhook URL** in **Workspace > Settings >
Notifications**, with the same token. Enabling the configuration sends a
`verification` request, which this handler answers with `200`.

## How It Works

- The route uses `express.raw({ type: '*/*' })`, so the raw body is available for any
  `Content-Type`.
- The signature is the hex HMAC-SHA512 of the raw body keyed with the token. Missing
  or invalid signatures return `400`.
- Run payloads carry triggers in `notifications[]`; workspace payloads carry a
  top-level `trigger`. Both are dispatched.

## Test

```bash
npm test
```

Tests generate real HMAC-SHA512 signatures and cover run, workspace, and
verification payloads.
