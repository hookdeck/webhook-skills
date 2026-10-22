# Terraform Webhooks - Next.js Example

Minimal example of receiving HCP Terraform (Terraform Cloud) and Terraform Enterprise
notification webhooks with `X-TFE-Notification-Signature` verification, using the
App Router.

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
   cp .env.example .env.local
   ```

3. Set `TERRAFORM_NOTIFICATION_TOKEN` in `.env.local` to the token you will enter on
   the notification configuration (it can't be viewed after saving).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 terraform --path /webhooks/terraform
```

Use the public URL it prints as the **Webhook URL** in **Workspace > Settings >
Notifications**, with the same token. Enabling the configuration sends a
`verification` request, which the route answers with `200`.

## How It Works

- `app/webhooks/terraform/route.ts` reads the raw body with `request.text()`, so any
  `Content-Type` verifies.
- `lib/terraform.ts` holds the HMAC-SHA512 verification and trigger parsing.
- Missing or invalid signatures return `400`.

## Test

```bash
npm test
```
