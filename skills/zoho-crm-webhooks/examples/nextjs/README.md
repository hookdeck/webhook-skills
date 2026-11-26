# Zoho CRM Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving [Zoho CRM workflow webhooks](https://help.zoho.com/portal/en/kb/crm-v2/automate-business-processes/actions/articles/crm-v2-webhooks-workflow) and authenticating them with a secret header.

Zoho CRM doesn't sign webhooks. You add a Custom Parameter under the webhook's Header, and the route compares that header's whole value with `ZOHO_CRM_WEBHOOK_SECRET` in constant time. CRM only sends headers on POST and PUT, so the route exports `POST` and `PUT` only.

## Prerequisites

- Node.js 18+
- A Zoho CRM edition with workflow webhooks (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `ZOHO_CRM_WEBHOOK_HEADER` to the Custom Parameter's name (default `X-Webhook-Secret`) and `ZOHO_CRM_WEBHOOK_SECRET` to its exact value.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST` or `PUT /webhooks/zoho-crm` in [app/webhooks/zoho-crm/route.ts](app/webhooks/zoho-crm/route.ts); the header check is in [lib/verify-zoho-crm.ts](lib/verify-zoho-crm.ts).

## Test

```bash
npm test
```

The tests cover the right, wrong, missing and prefixed header values, a custom header name, case-insensitive lookup, POST and PUT, JSON, form-encoded and XML bodies, malformed JSON, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 zoho-crm --path /webhooks/zoho-crm
```

Paste the printed HTTPS URL as the webhook's URL to Notify, then create or edit a record that meets the workflow rule's criteria.

## Notes

- The route reads `request.text()` so any body type works: Form-Data parameters, or a Raw Text/JSON/HTML/XML template. The header is checked before the body is read.
- Payloads are illustrative: Zoho sends whatever you configure, with no event name or record ID of its own. The handler expects a `module` and an `id` in the body.
- If `ZOHO_CRM_WEBHOOK_SECRET` is unset the route returns `500`. It never accepts unauthenticated requests.
- Respond within 10 seconds. After a failure Zoho sends one more attempt 15 minutes later.
