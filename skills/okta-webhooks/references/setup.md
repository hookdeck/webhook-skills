# Setting Up Okta Event Hooks

## Prerequisites

- An Okta org with **super admin** (or org admin) access to the Admin Console
- A publicly reachable HTTPS endpoint for your webhook (for local dev, use a tunnel — see below)
- A secret string you choose for the `Authorization` header

## Choose Your Authorization Secret

Okta authenticates each event delivery with a header value **you** define. Pick a
strong random string and store it in your app as `OKTA_WEBHOOK_SECRET`. You'll
enter the same value in the Admin Console when registering the hook.

```bash
# Example: generate a random secret
openssl rand -hex 32
```

## Register the Event Hook

You can register via the Admin Console or the API.

### Admin Console

1. In the Admin Console, go to **Workflow → Event Hooks**.
2. Click **Create Event Hook**.
3. Enter a **Name** and your endpoint **URL** (e.g. `https://your-app.com/webhooks/okta`).
4. Under **Authentication field**, enter `Authorization`.
5. Under **Authentication secret**, enter the same secret you stored as `OKTA_WEBHOOK_SECRET`.
6. Under **Subscribe to events**, select the events you want (e.g. `user.lifecycle.create`,
   `user.session.start`, `user.account.lock`, `group.user_membership.add`). Up to
   a limit per hook — only **event-hook-eligible** events appear.
7. Click **Save & Continue**.

### API (alternative)

```bash
curl -X POST "https://{yourOktaDomain}/api/v1/eventHooks" \
  -H "Authorization: SSWS ${OKTA_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My event hook",
    "events": {
      "type": "EVENT_TYPE",
      "items": [
        "user.lifecycle.create",
        "user.session.start",
        "user.account.lock",
        "group.user_membership.add"
      ]
    },
    "channel": {
      "type": "HTTP",
      "version": "1.0.0",
      "config": {
        "uri": "https://your-app.com/webhooks/okta",
        "authScheme": {
          "type": "HEADER",
          "key": "Authorization",
          "value": "your-shared-secret"
        }
      }
    }
  }'
```

## Verify the Endpoint (One-Time Handshake)

After creating the hook, you must verify ownership of the endpoint:

1. In the Admin Console, on the event hook, click **Verify**.
2. Okta sends a **GET** request to your URL with an `x-okta-verification-challenge` header.
3. Your endpoint must respond `200` with body `{"verification": "<challenge value>"}`.

Once verified, the hook shows as **VERIFIED** and Okta starts delivering events. If
verification fails, confirm your GET handler reads the header (case-insensitive)
and returns the exact JSON shape.

## Test Mode

Okta doesn't have a separate "test mode" for event hooks. To exercise your handler:

- Trigger a real event in a test org (e.g. sign in to produce `user.session.start`).
- Use the **Preview** tab on the event hook (if available) to send a sample.
- Replay captured requests through a tunnel with the Hookdeck CLI (below).

## Local Development

Create an Okta source in Hookdeck Event Gateway, then forward it to your local
server with the Hookdeck CLI, where `okta` is the source's name:

```bash
npx hookdeck-cli listen 3000 okta --path /webhooks/okta
```

Use the source URL as your event hook endpoint URL in the Admin Console, then click
**Verify**. Hookdeck answers Okta's verification GET itself (Okta's
[Hookdeck guide](https://developer.okta.com/docs/guides/event-hook-hookdeck/main/)
says no code is needed in your local app), so your local GET handler isn't called.

## Retries

Okta expects a `2xx` response within its three-second default timeout. It
retries a `5xx` response at most once and never retries a `4xx`; it doesn't
document the delay. Return `2xx` quickly and
process work asynchronously, and reconcile missed events from the System Log API,
where failed deliveries are recorded as `event_hook.delivery` events.
