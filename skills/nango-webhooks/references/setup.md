# Setting Up Nango Webhooks

## Prerequisites

- A Nango account (cloud at [app.nango.dev](https://app.nango.dev) or self-hosted)
- A public HTTPS endpoint that accepts `POST` requests (use the Hookdeck CLI for local development)

Webhook settings are **per environment**. Repeat these steps for each environment (`dev`, `prod`, ...).

## How Do I Get the Webhook Signing Key?

1. Open the Nango dashboard and pick the environment.
2. Go to **Environment Settings > Webhooks > Signing key**.
3. Copy the key into `NANGO_WEBHOOK_SIGNING_KEY`.

This is **not** the environment API key. The two are separate keys; on environments created after 2026-04-20, or after an API key rotation, they differ, and verifying with the API key fails.

If you use the Node SDK, you also need the API key (**Environment Settings > API key**) in `NANGO_API_KEY`: the `Nango` constructor requires one, and you need it anyway to fetch records after a `sync` webhook.

## How Do I Register My Webhook URL?

1. Go to **Environment Settings > Webhook URLs** (in the dev environment: `https://app.nango.dev/dev/environment-settings#notification`).
2. Enter your endpoint, e.g. `https://example.com/webhooks/nango`. You can add a second URL; Nango sends every webhook to both.
3. In the same settings, choose which webhooks to send (e.g. auth creation, refresh errors, sync webhooks, empty sync results).

Then make sure your handler accepts every type you enabled, and ignores the rest.

## Can a Single Connection Use a Different URL?

Yes. Set `webhook_url_override` on the connection. Its webhooks then go **only** to that URL (both environment URLs are bypassed for it). Signing and retries are unchanged.

```javascript
const session = await nango.createConnectSession({
  allowed_integrations: ['<INTEGRATION-ID>'],
  webhook_url_override: 'https://<your-tunnel>/webhooks/nango',
});
```

You can also set it in the dashboard (connection **Settings** tab) or with `PATCH /connections/{connectionId}`. This is handy for local development: point one test connection at your tunnel without touching the shared environment URLs.

## How Do I Forward External API Webhooks Through Nango?

1. Keep your app URL in **Environment Settings > Webhook URLs** (forwards use the same URLs).
2. Open **Integrations > [Integration] > Webhooks** and copy Nango's webhook URL for that integration.
3. Register that URL in the external provider's developer portal.
4. Set the provider's webhook secret on the integration so Nango can verify the provider's signature. Without it, forwards arrive flagged `unverified`.

See [Nango's forwarding guide](https://nango.dev/docs/guides/platform/webhook-forwarding) for per-provider routing requirements.

## How Do I Test Locally?

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 nango --path /webhooks/nango

# FastAPI
npx hookdeck-cli listen 8000 nango --path /webhooks/nango
```

Use the printed public URL as a webhook URL (or as a test connection's `webhook_url_override`), then create a connection from the dashboard or trigger a sync. Each delivery attempt also appears in Nango's logs.

## How Do I Rotate the Signing Key?

Use **Rotate key** under **Environment Settings > Webhooks > Signing key**, or the [rotate webhook signing key API](https://nango.dev/docs/reference/backend/http-api/environments/rotate-webhook-signing-key). For up to 5 minutes afterwards, webhooks may be signed with either key, so accept both during that window (see [verification.md](verification.md)).
