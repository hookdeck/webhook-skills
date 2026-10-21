# Setting Up Bolt Webhooks

## Prerequisites

- Bolt Merchant Dashboard account (sandbox or production) with write access to webhook settings
- Your application's public webhook endpoint URL (use `npx hookdeck-cli listen 3000 bolt --path /webhooks/bolt` for local development)

## Get Your Signing Secret

1. Log in to the Bolt Merchant Dashboard.
2. Go to **Administration > API**.
3. Scroll to **Signing Secret** and copy it. Use it as a raw string (no base64 decoding, no prefix stripping) as `BOLT_SIGNING_SECRET`.

## Register Your Endpoint

Dashboard:

1. Go to **Administration > Developers > Webhooks**.
2. Add your endpoint URL.
3. Subscribe to all events, or choose the events you need (see [overview.md](overview.md)). Recommended: `payment`, `auth`, `capture`, `credit`, `void`, `rejected_irreversible`, `rejected_reversible`.

API: create subscriptions with `POST /v1/webhooks`, providing `division_id`, `url`, and exactly one of `event_group` or `events`:

```bash
curl -X POST https://api-sandbox.boltapp.com/v1/webhooks \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $BOLT_API_KEY" \
  -d '{"division_id": "'"$BOLT_DIVISION_ID"'", "url": "https://example.com/webhooks/bolt", "event_group": "all"}'
```

Troubleshooting:

- Webhooks are **not** under **Administration > API > Merchant Callbacks**; callbacks and webhooks use different URLs.
- If the Webhooks page is missing, your user lacks write access to webhook settings, the account is a Marketplace sub-merchant (cannot configure webhooks), or you should ask Bolt to confirm webhook capabilities for the division. Without the v2 webhooks capability a division is limited to one endpoint.
- Review failed deliveries and resend them under **Administration > Webhooks**.

## Test Mode vs Live Mode

Bolt has a sandbox (`api-sandbox.boltapp.com`) and production environment, each with its own dashboard and Signing Secret. Complete a sandbox checkout (see Bolt's test cards) and confirm your endpoint receives the subscribed events and that replays don't duplicate updates.
