# Procore Webhooks - Next.js Example

Minimal example of receiving Procore resource webhooks (create, update, delete) and
authenticating them with the `Authorization` header.

Procore does not sign payloads. The only credential is the optional **Authorization Header**
value you set on the hook, which Procore places verbatim in the `Authorization` header of each
POST. The handler compares the **whole header value**, including any `Bearer ` or `Basic `
prefix, with a constant-time comparison. It never strips or base64-decodes the value.

A static credential authenticates the sender, not the body, and gives no replay protection.
Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Node.js 18+
- A Procore company with Admin access to the Company Admin tool
  (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `PROCORE_AUTHORIZATION` to the exact value you entered in Procore's **Authorization
   Header** field, e.g. `Basic c3a24b8208ac5199d083d54a1234e94b8864`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/procore`.

## Test

```bash
npm test
```

The tests send an illustrative v2-style payload with correct, wrong, prefix-less and missing
`Authorization` headers. To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/procore \
  -H "Content-Type: application/json" \
  -H "Authorization: $PROCORE_AUTHORIZATION" \
  -d '{"event_type":"create","resource_name":"RFIs","resource_id":3003}'
```

## Receive Procore Webhooks Locally

```bash
npx hookdeck-cli listen 3000 procore --path /webhooks/procore
```

Hookdeck's Procore source shows this setup note: Paste the Authorization Header value exactly
as set in Procore, including any "Bearer " or "Basic " prefix.

## How It Works

- `lib/verify-procore.ts` (`verifyProcoreRequest()`) and `app/webhooks/procore/route.ts`

1. The route reads `request.text()` after the credential check, so any content type works.
2. `Authorization` is compared in full with `PROCORE_AUTHORIZATION`. Missing or mismatched
   returns `401`.
3. The body must be a JSON object (`400` otherwise).
4. The handler dispatches on `event_type` (`create`, `update`, `delete`) and logs
   `resource_name` and `resource_id`.
5. It returns `200 {"received": true}`.
