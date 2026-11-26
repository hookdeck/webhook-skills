# Setting Up Ascend Webhooks

## Prerequisites

- An Ascend account with API/webhook access for your organization
- Your application's HTTPS webhook endpoint URL (e.g.
  `https://api.yourapp.com/webhooks/ascend`)

## Registration Is Manual (No Self-Serve Dashboard)

Ascend does **not** currently offer a self-serve dashboard for creating webhook
endpoints. Registration is handled by Ascend support.

Email **`developers@useascend.com`** and include:

1. **Organization** — the org the webhooks belong to.
2. **Environment** — Sandbox or Production (each is a separate registration).
3. **Events** — the event types you want delivered (e.g. `invoice.paid`). The
   invoice, payout and refund pages of Ascend's docs list all 12. Note the
   spellings `payout.canceled` and `refund.cancelled`.
4. **Endpoint URL** — the public HTTPS URL that will receive the `POST`
   requests.

## Get Your Signing Secret

When your endpoint is registered, Ascend provides a **webhook signing secret**.
This is the secret used to compute the HMAC-SHA256 signature in the
`X-Ascend-Signature` header.

Store it as an environment variable — never commit it to source control:

```bash
ASCEND_WEBHOOK_SECRET=your_ascend_webhook_secret
```

The same variable name is used across all examples in this skill.

## What Ascend Sends

Each delivery is an HTTP `POST` with:

- A JSON body of shape `{ "id", "type", "data" }`.
- Header `X-Ascend-Signature: t=<unix_timestamp>,v1=<hex_hmac_sha256>`.
- Header `X-Ascend-Request-Timestamp: <unix_timestamp>` (the same timestamp).

Your endpoint must:

1. Read the **raw** request body (before JSON parsing).
2. Verify the `X-Ascend-Signature` (see [verification.md](verification.md)).
3. Return **HTTP 200** on success. Return `400` for a missing/invalid signature.

## Sandbox vs Production

Ascend's Sandbox and Production environments are fully separate: each has its
own organization, data and API key, and no money moves in Sandbox. Register a
webhook for Sandbox first, then send a separate registration for Production.
Ascend's docs don't say whether the webhook key differs between them, so make
the secret configurable per environment rather than hardcoding it.

## Test Locally with the Hookdeck CLI

While developing, you can receive real webhooks on your local machine without
deploying. Run the Hookdeck CLI via `npx` (no install required):

```bash
# Express / Next.js (port 3000)
npx hookdeck-cli listen 3000 ascend --path /webhooks/ascend

# FastAPI (port 8000)
npx hookdeck-cli listen 8000 ascend --path /webhooks/ascend
```

The CLI prints a public URL you can give to Ascend support as your temporary
endpoint, and provides a web UI for inspecting and replaying requests. No
account is required — a guest account is created on first run.
