# Setting Up INGENIOUS.BUILD Webhooks

## Prerequisites

- Workspace admin access in INGENIOUS.BUILD (**Company Settings → Integrations Hub**)
- An HTTPS endpoint that accepts `POST` requests with JSON bodies and custom headers
  (use `npx hookdeck-cli listen 3000 ingenious-build --path /webhooks/ingenious-build` locally)

## Choose Your Auth Header

Add an auth header, such as Authorization: Bearer <token>, to each webhook URL on the Custom Accounting Integration.

Webhooks are not signed, so this header is the only thing that tells your endpoint a request came
from your INGENIOUS.BUILD workspace.

1. Pick a header name (the docs example is `Authorization`) and a long random value, for example
   `Authorization: Bearer 3f9c...`.
2. Store the name as `INGENIOUS_BUILD_WEBHOOK_HEADER` (default `Authorization`).
3. Store the **exact, whole header value** as `INGENIOUS_BUILD_WEBHOOK_SECRET`, including the
   `Bearer ` prefix if you typed one.

## Register Your Endpoint

1. In INGENIOUS.BUILD go to **Company Settings → Integrations Hub → Custom Accounting Integration**
   and click **Start Integration**.
2. Choose your **Mapping Requirements** (all boxes can stay unchecked while you test).
3. For each object type you plan to sync (Budgets, Budget Changes, Contracts, Contract Changes,
   Invoices), paste the webhook URL and add the authorization header from above. Leave the others blank.
4. Set a `custom_id` on accounting objects you load into INGENIOUS.BUILD so payloads carry your
   accounting system's identifiers.

## Test

Create a small invoice, take it through approval, map any required fields and click
**Sync to Accounting**. INGENIOUS.BUILD shows "Successfully Synced" and your endpoint receives the
payload. Or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/ingenious-build \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token-here" \
  -d '{"name":"invoice_exported_to_accounting","subject":"invoice","data":{"id":"1","invoice_number":"INV-123"}}'
```

(with `INGENIOUS_BUILD_WEBHOOK_SECRET="Bearer your-token-here"`).

## Network Notes

INGENIOUS.BUILD doesn't document source IPs, so an IP allowlist isn't an option. Rely on the auth
header over HTTPS.
