# Setting Up Surge Webhooks

You configure Surge webhooks in the dashboard at `hq.surge.app`. One endpoint per project receives events
from every account under that project.

## Prerequisites

- A Surge account with access to the project's webhook settings
- A public `https://` URL for your endpoint. Surge blocks URLs that resolve to private IP ranges
  (`10.x`, `172.16.x`, `192.168.x`, `127.x`) or reserved TLDs (`.local`, `.internal`, `.localhost`,
  `.test`), so `http://localhost` won't work. For local development use the Hookdeck CLI (below).

## Create an Endpoint and Get Your Signing Secret

1. Open the **Webhooks** page in the dashboard (the docs also call it **Settings → Webhooks**) and add the
   URL where you want to receive events, for example `https://webhooks.example.com/webhooks/surge`.
2. Choose the event subscriptions you want. Surge sends every subscribed type to the same endpoint.
3. Copy the signing secret shown next to the endpoint URL. It looks like `whsec_<base64-encoded-bytes>`.
   Put the full value, prefix included, in `SURGE_WEBHOOK_SECRET`.

The events are listed in [overview.md](overview.md). Several secrets can be live at once during rotation,
in which case `webhook-signature` carries several `v1,` entries and any one matching is enough.

## Test Your Endpoint

Surge doesn't document a challenge or handshake, so there is nothing special to answer. Trigger a real
event, such as sending a message to one of your numbers, and check the delivery attempts under **Webhooks**
in the dashboard. Your endpoint must return `2xx` directly: redirects are not followed, so trailing-slash
rewrites and `http` to `https` upgrades count as failures.

## Local Development

```bash
npx hookdeck-cli listen 3000 surge --path /webhooks/surge
```

Use the public URL the CLI prints as the endpoint URL in the dashboard. For the FastAPI example use port
`8000`.

## Delivery Behavior

- Return `2xx` quickly. Non-2xx responses and timeouts are retried with exponential back-off; the timeout
  and schedule aren't documented.
- Delivery is at least once, so the same event can arrive more than once. Make the handler idempotent.
- Do heavy work asynchronously: verify the signature, enqueue, and return `200`.
