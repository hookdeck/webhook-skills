# 360Learning Webhooks Setup

## Prerequisites

- A 360Learning admin account (for the Settings > Webhooks page), or an API client with the `webhooks:write` and `webhookSecrets:read` OAuth scopes.
- A public HTTPS endpoint. For local development, use `npx hookdeck-cli listen 3000 360learning --path /webhooks/360learning`.

## 1. Create a Subscription

A subscription is **one event type** sent to **one URL**. For several event types, create several subscriptions (they can share a URL).

### In the platform

1. Log in to your 360Learning admin account.
2. In the left sidebar, hover over the platform group and click **Settings** (gear icon), then **Webhooks**.
3. Click **Create subscription** and fill in a **Subscription label**, the **Subscription endpoint** URL and the **Event**.
4. Click **Confirm**.

Edit (pen icon), delete (bin icon) and activate/deactivate (the **Status** toggle) from the same list.

### With the API

```bash
curl -X POST https://app.360learning.com/api/v2/webhooks/subscriptions \
  -H "360-api-version: v2.0" \
  -H "Authorization: Bearer $THREE_SIXTY_LEARNING_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "HRIS sync - completions",
    "url": "https://example.com/webhooks/360learning",
    "eventType": "course.attempt.closed"
  }'
```

The `201` response returns the subscription with its `_id`, `name`, `url`, `eventType` and `status` (`active` or `inactive`). US platforms use `https://app.us.360learning.com` instead of `https://app.360learning.com`.

| Call | Purpose |
|------|---------|
| `GET /api/v2/webhooks/subscriptions` | List subscriptions |
| `GET /api/v2/webhooks/subscriptions/{id}` | Get one subscription |
| `PATCH /api/v2/webhooks/subscriptions/{id}` | Edit `name`, `url` or `status` (`eventType` isn't in the request schema) |
| `DELETE /api/v2/webhooks/subscriptions/{id}` | Delete it |

### Limits

- The same event type and URL can't be subscribed twice (`400 subscriptionAlreadyExists`).
- At most **3 subscriptions per event type** per company (`400 subscriptionsLimitReached`). Inactive subscriptions count; delete one to free a slot. To fan one event type out to more destinations, 360Learning suggests one subscription feeding your own router.

## 2. Get the Signing Secret

Each subscription has its own secret, and it never expires on its own.

- **Platform:** Settings > Webhooks, find the subscription, click **See secret** (lock icon).
- **API:** `GET /api/v2/webhooks/subscriptions/{id}/secrets` (scope `webhookSecrets:read`):

```bash
curl https://app.360learning.com/api/v2/webhooks/subscriptions/$SUBSCRIPTION_ID/secrets \
  -H "360-api-version: v2.0" \
  -H "Authorization: Bearer $THREE_SIXTY_LEARNING_ACCESS_TOKEN"
# => { "secret": "..." }
```

Set `THREE_SIXTY_LEARNING_WEBHOOK_SECRET` to that value exactly as shown. The handlers strip an optional `whsec_` prefix and base64-decode it. If one route receives several subscriptions, list all their secrets, comma-separated.

**Hookdeck:** the 360Learning source type (`THREE_SIXTY_LEARNING`) verifies the same signature with one secret, pasted with or without `whsec_`. Use one Hookdeck source per 360Learning subscription.

## 3. Rotate the Secret

```bash
curl -X POST https://app.360learning.com/api/v2/webhooks/subscriptions/$SUBSCRIPTION_ID/secrets/rotate \
  -H "360-api-version: v2.0" \
  -H "Authorization: Bearer $THREE_SIXTY_LEARNING_ACCESS_TOKEN"
# => 201 { "secret": "<new secret>" }
```

The new secret takes effect immediately. For the next **24 hours** every event is signed with both secrets (`webhook-signature: v1,<new> v1,<legacy>`), then the old one is retired. Deploy the new secret within that window; a handler that checks every `v1` entry keeps passing with either secret meanwhile. The same applies to a Hookdeck source: paste the new secret before the 24 hours are up.

## 4. Test

360Learning has no "send test event" button. Its docs suggest:

- A temporary inspection URL such as [Svix Play](https://play.svix.com/) (don't send sensitive data there), or
- A tunnel to your local server. With the Hookdeck CLI: `npx hookdeck-cli listen 3000 360learning --path /webhooks/360learning`, then create a subscription with the printed URL and trigger the event (for example create a user for `user.created`).

### Retrying Events

Events are kept for 90 days and can be resent, up to 3 days of events per request (scope `webhooks:write`):

```bash
curl -X POST https://app.360learning.com/api/v2/webhooks/subscriptions/$SUBSCRIPTION_ID/events/retry-failure \
  -H "360-api-version: v2.0" \
  -H "Authorization: Bearer $THREE_SIXTY_LEARNING_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "startDate": "2026-11-15T00:00:00.000Z", "endDate": "2026-11-18T00:00:00.000Z" }'
```

`/events/retry-success` does the same for events that were already delivered successfully, which is handy for replaying real events against a new handler.

## Reactivating a Subscription

If every delivery fails for 5 days the subscription becomes `inactive`. Fix the endpoint, then flip the **Status** toggle or send `{"status": "active"}` with `PATCH /api/v2/webhooks/subscriptions/{id}`.
