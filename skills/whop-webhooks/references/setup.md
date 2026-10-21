# Setting Up Whop Webhooks

## Prerequisites

- Whop account with access to the [Developer tab](https://whop.com/dashboard/developer)
- A public HTTPS endpoint (Whop rejects `localhost` and private addresses; use `npx hookdeck-cli listen 3000 whop --path /webhooks/whop` locally)

## Get Your Signing Secret

**Dashboard:** after creating the webhook, copy the value in the **Secret** column of the webhooks table.

**API:** `POST https://api.whop.com/api/v1/webhooks` returns `webhook_secret` once only. Store it immediately as `WHOP_WEBHOOK_SECRET`.

The secret is a `ws_...` string. Use it exactly as shown: do not strip the prefix, do not base64-decode it.

## Register Your Endpoint

Dashboard: Developer tab, **Create webhook**, enter the URL and select events.

API:

```bash
curl -X POST "https://api.whop.com/api/v1/webhooks" \
  -H "Authorization: Bearer $WHOP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/webhooks/whop", "events": ["payment.succeeded"]}'
```

Recommended events: `payment.succeeded`, `payment.failed`, `membership.activated`, `membership.deactivated`, `refund.created`. Set `api_version_date` at creation to pin payload shape.

## Testing

- Dashboard: open the webhook's menu and send a test event, or call `POST /api/v1/webhooks/{id}/test`.
- Inspect deliveries (kept 30 days) in the dashboard or `GET /api/v1/webhooks/{id}/deliveries`.
- Re-enable a disabled webhook from the dashboard or `PATCH /api/v1/webhooks/{id}` with `"enabled": true`.
