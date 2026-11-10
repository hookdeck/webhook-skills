# Preparing Webhooks for BFCM

Work through this checklist in the weeks before the peak, not the day before. Each step is a CLI command or API call. For the infrastructure-as-code version, see [terraform.md](terraform.md).

```sh
export HOOKDECK_API_KEY=...
export API=https://api.hookdeck.com/2026-09-01
hookdeck ci --api-key "$HOOKDECK_API_KEY" && hookdeck whoami   # confirm the project (ci also prints it)
```

## 1. Make the handler peak-ready

Hookdeck can hold and replay webhooks; it can't make a slow or non-idempotent handler safe. Before anything else:

- **Verify, enqueue, return `2xx`.** Do the work asynchronously. Shopify gives the whole request 5 seconds ([provider-notes.md](provider-notes.md)); a handler doing inline work under peak load will time out and trigger provider retries on top of the surge.
- **Idempotent.** Recovery will redeliver some webhooks you already processed. Key on the provider's event or delivery ID (`X-Shopify-Webhook-Id`, Stripe `event.id`).
- **Order-tolerant.** See [ordering.md](ordering.md) and the [handler ordering patterns](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/ordering.md).
- **Replay-safe signature checks.** Captured webhooks may be replayed hours later, and in a standby setup they arrive signed for the **standby** endpoint. Two things break provider-signature checks on replay:
  - **Timestamp tolerance:** Stripe SDKs reject signatures older than 5 minutes by default.
  - **Per-endpoint secrets:** Stripe, PayPal and WooCommerce sign each endpoint with its own secret. Shopify signs with the app secret, so Shopify signatures still verify.

  For deliveries that come through Hookdeck, verify the `x-hookdeck-signature` instead (see [hookdeck-event-gateway-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway-webhooks)). That is only safe when the Hookdeck source verifies the provider signature on the way in, which is why every source below is created with verification on.
- **No provider-IP allowlist on the webhook route**, or one that also allows Hookdeck's outbound IPs. Recovery deliveries come from Hookdeck, not from the provider.

## 2. Know your safe delivery rate

Load-test the endpoint with sudden onset (not a slow ramp) at several times normal peak. Record:

- the **sustained rate** it handles without errors or growing latency, and
- the **headroom** above live peak traffic: the rate a recovery backlog can use while live traffic continues.

That headroom is the recovery destination's rate limit.

## 3. Choose standby or inline

| | **Standby** | **Inline** |
|---|---|---|
| Path | Provider → your endpoint, **and** provider → Hookdeck source with no connection | Provider → Hookdeck → your endpoint |
| Code / DNS change | None. Add a second subscription at the provider | Provider points at Hookdeck |
| During an outage | Provider deliveries to you fail; Hookdeck has a full copy | Hookdeck queues and retries; the provider sees `200` throughout |
| Recovery | Bulk replay the capture window into a recovery lane | Pause or throttle, then retry failures |
| Provider auto-disable risk | Your direct subscription can still be disabled or deleted (Shopify deletes Admin-API subscriptions after 8 failures). The standby subscription keeps capturing | None: Hookdeck acknowledges every delivery |
| Best for | Teams that can't change the delivery path before the peak | Teams that want Hookdeck to absorb surges permanently |

Both are valid. Standby is the lower-risk change to make shortly before a peak.

## 4a. Standby setup

1. **Create the standby source** with provider signature verification and no connection:

   ```sh
   SRC_JSON=$(hookdeck gateway source upsert shopify-standby --type SHOPIFY \
     --webhook-secret "$SHOPIFY_APP_CLIENT_SECRET" --output json)
   export STANDBY_SRC=$(echo "$SRC_JSON" | jq -r .id)
   export STANDBY_URL=$(echo "$SRC_JSON" | jq -r .url)
   ```

   - **Verification is not optional.** Hookdeck verifies before it records a request as `NO_CONNECTION`, so forged requests are stored as `VERIFICATION_FAILED` and the recovery replay never picks them up. With an unverified source, anyone who learns the URL can plant requests that recovery would deliver to production with a valid Hookdeck signature.
   - **Stripe:** register the standby endpoint first (step 2), then set the source's secret to that endpoint's own signing secret: `hookdeck gateway source upsert stripe-standby --type STRIPE --webhook-secret "$STANDBY_WHSEC"`.
   - Use one standby source per provider (or per store), so a recovery replay can filter by source.

2. **Register `$STANDBY_URL` at the provider** as an additional endpoint for the same topics as your direct subscription (and, for Stripe, the same API version, so replayed payloads have the same shape). Keep the direct one. With Terraform, `hookdeck_webhook_registration` can do this ([terraform.md](terraform.md)).

3. **Check capture works**, in two halves:

   - **Unsigned requests are rejected.** An unsigned test request should get `401` from the edge and be stored as `VERIFICATION_FAILED`:

     ```sh
     curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$STANDBY_URL" \
       -H "Content-Type: application/json" -d '{"bfcm_capture_test": true}'
     # → 401. A 200 is possible for about a minute after the source is created, before the edge
     #   has its verification settings; core still verifies and records the result either way.

     hookdeck gateway request list --source-id "$STANDBY_SRC" --limit 1 --output json \
       | jq '.models[0] | {id, rejection_cause, created_at}'
     # → "rejection_cause": "VERIFICATION_FAILED"
     ```

   - **Genuine webhooks are captured.** Trigger a real provider test event (Shopify and Stripe both have test-delivery tools), then confirm it is stored as `NO_CONNECTION`:

     ```sh
     hookdeck gateway request list --source-id "$STANDBY_SRC" --rejection-cause NO_CONNECTION \
       --limit 1 --output json | jq '.models[0] | {id, rejection_cause, created_at}'
     ```

   If genuine events show `VERIFICATION_FAILED`, the secret is wrong. Fix it now, not mid-incident.

4. **Pre-provision the recovery lane.** It sits idle until an incident, which removes a step from the runbook:

   ```sh
   hookdeck gateway connection upsert bfcm-recovery \
     --source-name bfcm-recovery --source-type WEBHOOK \
     --source-config "{\"auth_type\":\"API_KEY\",\"auth\":{\"header_key\":\"x-api-key\",\"api_key\":\"$(openssl rand -hex 32)\"}}" \
     --destination-name orders-api-recovery --destination-type HTTP \
     --destination-url https://api.example.com/webhooks/shopify \
     --destination-rate-limit 10 --destination-rate-limit-period second \
     --rules '[{"type":"retry","strategy":"exponential","count":10,"interval":60000,"response_status_codes":["429","500-599"]}]'
   ```

   Use `--source-config` and `--rules` exactly as above. The shortcuts don't work here: `--source-api-key` on a `WEBHOOK` source is rejected (`source.config.auth is not allowed`), and `--rule-retry-response-status-codes` only accepts single codes, not ranges like `500-599`.

   The recovery source requires an API key nobody uses: its connection delivers straight to production with a valid Hookdeck signature, so it must not accept requests from anyone. Replay skips source verification, so the key doesn't block replays.

5. **Don't alert on the standby's `NO_CONNECTION` requests.** That is expected behaviour; new projects exclude `NO_CONNECTION` from request issue alerts by default.

## 4b. Inline setup

```sh
hookdeck gateway connection upsert shopify-orders \
  --source-name shopify --source-type SHOPIFY --source-webhook-secret "$SHOPIFY_SECRET" \
  --destination-name orders-api --destination-type HTTP \
  --destination-url https://api.example.com/webhooks/shopify \
  --destination-rate-limit 50 --destination-rate-limit-period second \
  --rules '[{"type":"retry","strategy":"exponential","count":10,"interval":60000,"response_status_codes":["429","500-599"]}]'
```

- Set the rate to the sustained rate from step 2. Peaks above it queue in Hookdeck instead of hitting the endpoint.
- Point the provider's subscription at the source URL (`hookdeck gateway source get shopify --output json | jq -r .url`).

## 5. Check payload retention

Replay needs the stored payload. If a payload falls outside your plan's retention window, replaying it fails with `409 DATA_ARCHIVED`. Make sure retention comfortably covers the time it takes to detect, fix and replay an outage: a full holiday weekend, not a few hours.

## 6. Alert on the right signals

Create issue triggers with the API. `PUT /issue-triggers` upserts by `name`, so these are safe to re-run.

```sh
# Backlog building up: events waiting longer than 5 minutes to deliver
curl -sS -X PUT "$API/issue-triggers" -H "Authorization: Bearer $HOOKDECK_API_KEY" \
  -H "Content-Type: application/json" -d '{
    "name": "bfcm-backpressure",
    "type": "backpressure",
    "configs": { "delay": 300000, "destinations": "!orders-api-recovery" },
    "channels": { "email": {} }
  }'

# Deliveries failing (first failed attempt)
curl -sS -X PUT "$API/issue-triggers" -H "Authorization: Bearer $HOOKDECK_API_KEY" \
  -H "Content-Type: application/json" -d '{
    "name": "bfcm-delivery-failures",
    "type": "delivery",
    "configs": { "strategy": "first_attempt", "connections": "*" },
    "channels": { "email": {} }
  }'
```

The backpressure trigger excludes the recovery destination by name (`!` prefix), because a recovery backlog is deliberate. `channels` also accepts `slack`, `microsoft_teams`, `pagerduty`, `opsgenie`, `incidentio` and others once those integrations are connected to the project. `email: {}` notifies all eligible members.

In your own system, alert on **freshness** as well as errors: the gap between a webhook's creation time and when you processed it. Freshness catches a provider-side delay that error rates miss.

## 7. Rehearse

Run the recovery runbook end to end against a non-production project before the peak:

1. Point a test standby source at a test endpoint, and stop the endpoint.
2. Send a burst of test requests.
3. Run [incident-standby.md](incident-standby.md) (or [incident-inline.md](incident-inline.md)) start to finish, and time it.
4. Check the replayed events arrived approximately in order and that the handler deduplicated the overlap.

Write the real project's IDs (standby source, recovery connection and destination) into your incident runbook so nobody has to look them up mid-incident.

## 8. Freeze

During the peak, freeze changes to Hookdeck configuration along with your code freeze, except the recovery actions in the runbooks.
