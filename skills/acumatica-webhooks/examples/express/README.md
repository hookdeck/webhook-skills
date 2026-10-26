# Acumatica Webhooks - Express Example

Minimal example of receiving Acumatica push notifications (Webhook destination) and
authenticating them with the secret header you configured.

Acumatica does not sign requests, so there is no HMAC to verify. The Webhook destination adds
one header (your **Header Name** and **Header Value**), and the handler compares it with
`ACUMATICA_WEBHOOK_SECRET` using a constant-time comparison. The route reads the body with
`express.raw({ type: '*/*' })`, so any content type works, and parses it only after the check.

A static shared credential authenticates the sender, not the body, and gives no replay
protection. Use HTTPS and rotate the value if it leaks.

## Prerequisites

- Node.js 20+
- An Acumatica instance with a Webhook destination (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `ACUMATICA_WEBHOOK_HEADER` to the destination's Header Name and
   `ACUMATICA_WEBHOOK_SECRET` to the exact whole Header Value (including any `Bearer ` prefix).

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/acumatica`.

## Test

```bash
npm test
```

The tests send inserted, deleted and updated notifications with correct, wrong and missing
header values. No Acumatica instance is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/acumatica \
  -H "Content-Type: application/json" \
  -H "Authorization: $ACUMATICA_WEBHOOK_SECRET" \
  -d '{"Inserted":[{"InventoryID":"AACOMPUT01"}],"Deleted":[],"Query":"Stock Items: Last Modified Date","CompanyId":"MyTenant","Id":"1af4d140-5321-41f2-a2ec-50b67f577c6c","TimeStamp":636295833829493672,"AdditionalInfo":{}}'
```

## Receive Webhooks Locally

Acumatica can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 acumatica --path /webhooks/acumatica
```

Put the printed URL in the **Address** of the Webhook destination.

## How It Works

- `src/index.js`: `verifyAcumaticaRequest()` plus the `POST /webhooks/acumatica` route

1. The configured header is looked up case-insensitively and compared in full. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. There is no event-type field: the handler classifies the change from `Inserted` / `Deleted`
   (inserted, deleted, updated) and names it by `Query`.
4. Notifications with a repeated `Id` are acknowledged without reprocessing.
5. It returns `200 {"received": true}`.
