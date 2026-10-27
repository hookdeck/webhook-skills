# Setting Up Superwall Webhooks

## Prerequisites

- A Superwall app with [revenue tracking](https://superwall.com/docs/dashboard/dashboard-settings/overview-settings-revenue-tracking) set up. Until it is, the dashboard shows **Needs revenue tracking** on the Webhooks integration.
- A public `https://` URL for your receiver. The URL can't contain credentials. For local work, use the Hookdeck CLI tunnel.

## How Do I Create a Superwall Webhook?

In the dashboard:

1. Open your app, go to **Integrations**, and select **Webhooks** under **Webhooks and tools**.
2. Click **Create webhook** and fill in:
   - **Webhook name**: how it appears in the dashboard.
   - **Webhook URL**: e.g. `https://example.com/webhooks/superwall`.
   - **Events to listen for**: all are selected by default. A useful start is `initial_purchase`,
     `renewal`, `cancellation`, `refund`, `billing_issue` and `expiration`.
   - **Custom headers** (optional): headers Superwall adds to every request, such as `X-API-Key`.
     An `Authorization` header is removed before delivery, so put credentials in a different header.
3. Copy the signing secret the dashboard shows. It is displayed **once**.

Or with the API (key with the `webhooks:read` and `webhooks:write` scopes). Pass
`format=superwall_v2` on every webhook and event request, otherwise the API manages legacy webhooks:

```bash
curl -X POST "https://api.superwall.com/v2/projects/$PROJECT_ID/webhook_endpoints?format=superwall_v2" \
  -H "Authorization: Bearer $SUPERWALL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/webhooks/superwall", "filter_types": ["INITIAL_PURCHASE", "RENEWAL", "REFUND", "EXPIRATION"]}'
```

The response includes the webhook's `secret`. Omit `filter_types` to receive every event type,
including types added later. Note the API and dashboard filter uses the **uppercase** names
(`RENEWAL`); the payload's `type` is lowercase (`renewal`).

## Where Do I Find the Signing Secret?

Each webhook has its own signing secret, in the `whsec_` + base64 format. For V2 webhooks it is shown
once after creation (and on **Rotate secret**); the API returns it on create and rotate. If you lose
it, open the webhook and click **Rotate secret**. **The new secret takes effect immediately**, so your
server rejects Superwall's requests until you update it. Store the full value, prefix included:

```bash
SUPERWALL_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

If the value doesn't start with `whsec_`, the examples reject it with a 500 instead of verifying
with the wrong key.

## Which Format Am I Getting: V2 or Legacy?

Every webhook created in the dashboard now uses **Webhooks V2**. Webhooks created earlier are labelled
**Legacy**, keep working, and keep the older camelCase payload. Dashboard-created webhooks send a
`superwall_version` header: `2` for V2 and `1` for legacy. The examples use it (falling back to the
body shape) so one receiver can handle both while you migrate: create a V2 webhook next to the legacy
one, compare both streams, then delete the legacy one.

## How Do I Test a Webhook?

Superwall doesn't send test events to V2 webhooks. Make a sandbox purchase instead:

- iOS: TestFlight with a sandbox Apple ID. Local StoreKit configuration files and StoreKitTest do
  **not** produce App Store Server Notifications, so no webhook fires.
- Google Play: license test accounts.
- Stripe: test mode.

## Managing and Monitoring

Open a webhook to see its status, success rate and **Recent activity** (each attempt with status,
response code and duration). The **Activity** card lists every message Superwall sent. You can
**Pause**, **Resume** or **Delete** a webhook. **Events that occur while a webhook is paused are not
delivered later.**

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| Every delivery fails verification | The handler verifies a parsed/re-serialized body instead of the raw bytes, or the secret is stale after **Rotate secret** |
| Nothing arrives | The webhook is paused, not subscribed to that event type, or revenue tracking isn't set up |
| Events missed during an outage | Retries use exponential backoff (no schedule documented); events missed while *paused* are not replayed |
| `app_user_id`, `subscriber` and `subscription` are `null` | Superwall didn't learn the owner within its 48-hour hold; match on `event_data.original_app_user_id` and `event_data.original_transaction_id` |
