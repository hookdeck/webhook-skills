# Setting Up Coterie Webhooks

## Prerequisites

- A Coterie partner account with API access
- A public HTTPS endpoint for your webhook receiver (use the Hookdeck CLI locally)

## Enable Webhooks and the Authentication Header

Coterie's documentation describes no self-service webhook dashboard. Webhooks and every
optional header "must be turned on by request only", so work with your Coterie contact:

1. Give them your endpoint URL (for example `https://example.com/webhooks/coterie`).
2. Ask for the webhook kinds you need: applications, quotes and/or policies.
3. Ask them to enable the **Authentication** header. Coterie then sends
   `Authentication: token {guid}` on every webhook.
4. Store the full value (`token <guid>`, prefix included) as `COTERIE_AUTHENTICATION`.
5. Optionally ask for `x-timeStamp`, `x-applicationId` and `x-leadId`.

Ask your contact to confirm the exact token string they configured; the whole value is the
secret.

## Local Testing

```bash
npx hookdeck-cli listen 3000 coterie --path /webhooks/coterie
```

Use the printed URL as the endpoint. For FastAPI, use port `8000`.

## Test Environment

The documented sample `ApplicationUrl` points at `quote-test.coterieinsurance.com`, so
Coterie runs a separate test environment. Confirm with your contact which environment sends
to which endpoint, and configure the token for each.

## Sending a Manual Test

```bash
curl -X POST http://localhost:3000/webhooks/coterie \
  -H "Content-Type: application/json" \
  -H "Authentication: $COTERIE_AUTHENTICATION" \
  -d '{"PolicyId":"b6a4f634-a78f-40a2-bede-8bd352435d19","PolicyNumber":"CSANDSB-00080305-00","Status":"Pending"}'
```
