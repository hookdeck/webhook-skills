# Setting Up Stitch Webhooks

## Prerequisites

- A Stitch client (client ID and secret / certificate)
- A public HTTPS endpoint (or a Hookdeck CLI tunnel for local development)
- A client token with the right scope:
  - `client_webhook_manage` for `clientWebhookAdd`, `clientWebhookDelete`,
    `webhookEndpoints`, `clientSubscriptionMigrate`
  - `client_webhooks_dashboard` for `webhookLogin` (Svix portal link)

If token retrieval returns `invalid_scope`, ask your Stitch integration contact
to enable the scope on your client.

A subscription is configured once per client ID, not per request.

## How Do I Create a Subscription via the API?

Call the `clientWebhookAdd` mutation with two fields:

| Field | Usage |
|-------|-------|
| `url` | Your HTTPS endpoint, e.g. `https://example.com/webhooks/stitch` |
| `filterTypes` | Event types to receive, e.g. `["payment", "refund", "disbursement"]` |

The response includes the subscription's **signing secret** (`whsec_...`). Store
it as `STITCH_WEBHOOK_SECRET`. See the query example in the
[Stitch docs](https://docs.stitch.money/webhooks/using_webhooks#via-api) for the
exact mutation shape.

## How Do I Create a Subscription in the Svix Portal?

1. Get a client token with the `client_webhooks_dashboard` scope.
2. Run the `webhookLogin` query to get a single-use login link to the Svix
   consumer portal.
3. Click **Add Endpoint**, enter your URL, and pick one or more event types.
   (No server yet? Use **Svix Play** to get a temporary inspection URL.)
4. Click **Create**. The endpoint's details page shows the **Signing Secret**.

The **Advanced** tab also lets you set rate limits, custom headers, and mTLS.

## Local Development

```bash
npx hookdeck-cli listen 3000 stitch --path /webhooks/stitch   # Express / Next.js
npx hookdeck-cli listen 8000 stitch --path /webhooks/stitch   # FastAPI
```

Use the printed URL as the subscription `url`.

## Retries and Acknowledgement

- Return HTTP `200` once the webhook is received and verified.
- Any non-2xx response or timeout is retried by Svix with exponential backoff.
- Processing must be **idempotent**: the same event can arrive more than once.
- The Svix portal can resend single messages, recover failed messages, or replay
  missing ones. Svix keeps messages for 90 days.

## Firewalls

Stitch's Svix account is in the **EU region**. If your endpoint is behind a
firewall, allow Svix's EU source IPs (see the Svix docs).

## Rotating the Signing Secret

In the Svix portal, open the endpoint, use the top-right dropdown, and choose
**Rotate Secret**. During rotation `svix-signature` can contain more than one
signature, so check every `v1` entry (the `svix` libraries do this).

## Managing Subscriptions via the API

- `webhookEndpoints` lists subscriptions (omit the filter to see all types).
- `clientWebhookDelete` removes a type (pass `filterTypes`) or the whole
  endpoint (omit `filterTypes`).

## Migrating from Legacy Webhooks

Legacy subscribers can run `clientSubscriptionMigrate` with the legacy
subscription ID. Payload structure and verification change to Svix, so update
your handler first, or run a new Svix endpoint in parallel with the legacy one
and skip the migration mutation.
