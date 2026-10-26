# Setting Up Autumn Webhooks

## Prerequisites

- An Autumn account (sandbox or production; webhooks are per environment)
- A public **https** endpoint. Autumn rejects localhost and private-network URLs. Tunnels such as ngrok or the Hookdeck CLI work.

## How Do I Get My Signing Secret?

The `whsec_` secret is returned **once**:

- **Dashboard:** when you add the endpoint (Developer → Webhooks), copy it then.
- **API:** the response of `webhooks.create` (`POST /v1/webhooks.create`) or `webhooks.sync` includes `secret` for each webhook it creates. `webhooks.get` and `webhooks.list` **never** return it.

Store it immediately, for example as `AUTUMN_WEBHOOK_SECRET`. If you lose it, create a new webhook (the `id` can't be changed, and there's no way to read the secret back).

## How Do I Register an Endpoint?

### In the dashboard

1. Go to **Developer** → **Webhooks** tab.
2. Click **Add Endpoint** and enter your URL.
3. Choose all events or specific ones.
4. Save, copy the secret, then use **Send Test Event**.

### With the API

```bash
curl -X POST https://api.useautumn.com/v1/webhooks.create \
  -H "Authorization: Bearer $AUTUMN_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"billing","url":"https://example.com/webhooks/autumn","events":["billing.updated","invoice.finalized"]}'
```

The response includes `"secret": "whsec_..."`. `webhooks.sync` declaratively creates or updates a list of webhooks (and only returns secrets for the ones it creates). Webhooks not listed are left alone unless you pass `skip_deletions: false`, which deletes every unlisted webhook, including dashboard-made ones. `webhooks.preview_sync` shows what would change.

## Which Events Should I Subscribe To?

Start with `billing.updated` (plan state), `balances.limit_reached` and `balances.usage_alert_triggered` (usage), `billing.auto_topup_failed` (payment problems) and `invoice.finalized` (accounting). Leaving `events` out in the API sends everything.

## Sandbox vs Live

Each Autumn environment has its own webhooks and secrets. A webhook created with a sandbox key is signed with a different secret than a production one.

## Local Testing

```bash
npx hookdeck-cli listen 3000 autumn --path /webhooks/autumn
```

Register the tunnel URL as the endpoint, then click **Send Test Event**. Hookdeck retries and replays resend the original `svix-timestamp`, so see [verification.md](verification.md) before relying on the svix library behind a gateway.
