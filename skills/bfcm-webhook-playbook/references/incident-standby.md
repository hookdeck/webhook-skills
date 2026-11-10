# Recovery Runbook: Standby Capture

Use this when the provider delivers to your endpoint directly **and** to a Hookdeck source with **no connection** (the standby source), and your endpoint has failed. Hookdeck has been recording every webhook as a `NO_CONNECTION` request. Recovery replays those requests, oldest first, into a separate **recovery lane** (its own source, destination and connection) that delivers to your fixed endpoint at a controlled rate.

If you have no Hookdeck at all, start with [No Hookdeck yet: emergency capture](#no-hookdeck-yet-emergency-capture).

## Why a separate recovery lane

Do **not** attach a connection to the standby source to drain the backlog:

- Live webhooks would start flowing through it immediately, ahead of the older backlog that bulk replay is still working through, so new events land before old ones.
- The provider also delivers live traffic directly to your endpoint, so every live webhook would arrive twice.
- The standby source must stay connection-less so it keeps capturing for the next incident.

Bulk replay can target a connection on a **different** source, so the backlog goes to the recovery lane and nothing else does.

## Variables used below

```sh
export HOOKDECK_API_KEY=...                         # project API key
export API=https://api.hookdeck.com/2026-09-01
export STANDBY_SRC=src_...                          # standby source ID
export RECOVERY_CONN=web_...                        # recovery connection ID (step 3)
export RECOVERY_DEST=des_...                        # recovery destination ID (step 3)
export T0=2026-11-27T14:05:00Z                      # last webhook your system processed successfully
export T1=...                                       # when live delivery resumed (step 2)
```

The commands use `jq` to read JSON output. CLI list commands print `{"models": [...], "pagination": {...}}`; `get` commands print the object.

## Step 0 — Authenticate and confirm the project

```sh
hookdeck ci --api-key "$HOOKDECK_API_KEY"
hookdeck whoami
```

Show the `whoami` output to the user and get confirmation that this is the right organization and project before going further.

## Step 1 — Confirm Hookdeck is capturing, and fix T0

```sh
hookdeck gateway request list \
  --source-id "$STANDBY_SRC" --status rejected --rejection-cause NO_CONNECTION \
  --created-after "$T0" --order-by created_at --dir desc --limit 5 --output json \
  | jq '.models[] | {id, created_at}'
```

- Recent requests listed: capture is working. Carry on.
- Nothing since `T0`: the provider is not sending to the standby source (subscription missing, or wrong URL). Fix that first. Anything not captured has to come from provider resend or reconciliation (see [provider-notes.md](provider-notes.md)).

Agree `T0` with the user: the `created_at` of the last webhook your system definitely processed. When unsure, pick an earlier time. Handlers are idempotent, so replaying a few already-processed webhooks costs little; missing some costs orders.

## Step 2 — Fix the endpoint, then fix T1

The fix itself happens outside Hookdeck. Before continuing, confirm the endpoint is healthy (health check, error rate back to normal).

`T1` is the moment live delivery resumed:

- **Direct delivery resumed** (your endpoint is accepting the provider's own deliveries again): `T1` is when the first direct delivery succeeded. If the provider deleted or disabled your direct subscription (Shopify deletes Admin-API subscriptions after 8 consecutive failures; see [provider-notes.md](provider-notes.md)), recreate it first, then take `T1` from then.
- **Staying on Hookdeck from now on** (moving to an inline setup): create the live connection on the standby source at `T1`. Every request before `T1` is still `NO_CONNECTION` and gets replayed below; every request after `T1` is delivered by the live connection.

Until `T1` is fixed, leave it unset and replay up to "now" in batches. A second, narrower replay for a later window must start exactly where the previous one ended.

## Step 3 — Create the recovery lane

Skip this if it was pre-provisioned in preparation ([terraform.md](terraform.md)); just look up the IDs.

```sh
hookdeck gateway connection upsert bfcm-recovery \
  --source-name bfcm-recovery --source-type WEBHOOK \
  --destination-name orders-api-recovery --destination-type HTTP \
  --destination-url https://api.example.com/webhooks/shopify \
  --destination-rate-limit 10 --destination-rate-limit-period second \
  --rule-retry-strategy exponential --rule-retry-count 10 \
  --rule-retry-interval 60000 --rule-retry-response-status-codes "429,500-599"

hookdeck gateway connection get bfcm-recovery --output json | jq '{id, destination_id: .destination.id}'
```

- Set the rate from what the endpoint can take **on top of live traffic**, not its total capacity. Live traffic is still arriving directly.
- Keep the recovery destination separate from any live destination so its rate limit and pausing don't affect live delivery.
- Don't add deduplication or delay rules to the recovery connection; they would drop or hold replayed events.

## Step 4 — Canary: replay the oldest request alone

```sh
FIRST=$(hookdeck gateway request list \
  --source-id "$STANDBY_SRC" --status rejected --rejection-cause NO_CONNECTION \
  --created-after "$T0" --order-by created_at --dir asc --limit 1 --output json)
FIRST_ID=$(echo "$FIRST" | jq -r '.models[0].id')
FIRST_AT=$(echo "$FIRST" | jq -r '.models[0].created_at')

curl -sS -X POST "$API/requests/$FIRST_ID/replay" \
  -H "Authorization: Bearer $HOOKDECK_API_KEY" -H "Content-Type: application/json" \
  -d "{\"webhook_ids\": [\"$RECOVERY_CONN\"]}" | jq '.events[0].id'

hookdeck gateway event list --connection-id "$RECOVERY_CONN" --limit 1 --output json \
  | jq '.models[0] | {id, status, response_status}'
```

Expect `SUCCESSFUL`. If it fails, stop and diagnose before replaying anything else:

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `401`/`400` from your handler, signature error in logs | Handler verifies the provider signature with a timestamp tolerance (Stripe SDKs default to 5 minutes), and the captured payload is older | Verify the Hookdeck signature (`x-hookdeck-signature`) for deliveries via Hookdeck, or widen the tolerance for the recovery window |
| `5xx` | Endpoint not actually healthy | Back to step 2 |
| `409 DATA_ARCHIVED` from the replay call | Payload is outside the retention window | Use provider resend / API reconciliation for that period |

## Step 5 — Dry run, then bulk replay

The window starts **after** the canary (`gt`), so the canary request isn't delivered twice.

```sh
curl -sS -G "$API/bulk/requests/replay/plan" -H "Authorization: Bearer $HOOKDECK_API_KEY" \
  --data-urlencode "query[source_id]=$STANDBY_SRC" \
  --data-urlencode "query[status]=rejected" \
  --data-urlencode "query[rejection_cause]=NO_CONNECTION" \
  --data-urlencode "query[created_at][gt]=$FIRST_AT" \
  --data-urlencode "query[created_at][lte]=$T1" | jq '{estimated_count, estimated_batch}'
```

Show `estimated_count` to the user and get explicit confirmation. Then:

```sh
OP=$(curl -sS -X POST "$API/bulk/requests/replay" \
  -H "Authorization: Bearer $HOOKDECK_API_KEY" -H "Content-Type: application/json" \
  -d "{
    \"query\": {
      \"source_id\": \"$STANDBY_SRC\",
      \"status\": \"rejected\",
      \"rejection_cause\": \"NO_CONNECTION\",
      \"created_at\": { \"gt\": \"$FIRST_AT\", \"lte\": \"$T1\" },
      \"target\": { \"webhook_ids\": [\"$RECOVERY_CONN\"] }
    }
  }")
OP_ID=$(echo "$OP" | jq -r '.id'); echo "$OP_ID"   # record this
```

Record `OP_ID`, `FIRST_ID`, `FIRST_AT`, `T0` and `T1` in the incident notes now.

## Step 6 — Watch and control the pace

```sh
# Bulk operation progress
curl -sS "$API/bulk/requests/replay/$OP_ID" -H "Authorization: Bearer $HOOKDECK_API_KEY" \
  | jq '{progress, completed_count, failed_count, in_progress, completed_at}'

# Delivery health on the recovery lane
hookdeck gateway event list --connection-id "$RECOVERY_CONN" --status FAILED --limit 20 --output json \
  | jq '.models[] | {id, response_status, created_at}'
```

If the endpoint struggles:

```sh
# Slow down (preferred: keeps order intact)
hookdeck gateway destination update "$RECOVERY_DEST" --rate-limit 5 --rate-limit-period second

# Emergency hold: events are kept, not lost. Unpausing re-queues in large blocks (see ordering.md)
hookdeck gateway connection pause bfcm-recovery
hookdeck gateway connection unpause bfcm-recovery

# Stop creating more replays (already-created events still deliver)
curl -sS -X POST "$API/bulk/requests/replay/$OP_ID/cancel" -H "Authorization: Bearer $HOOKDECK_API_KEY"
```

If you cancel and later resume, start the new replay window after the `created_at` of the last request that was replayed, not from `FIRST_AT` again.

## Step 7 — Mop up

1. **Retry deliveries that failed on the recovery lane.**

   ```sh
   curl -sS -G "$API/bulk/events/retry/plan" -H "Authorization: Bearer $HOOKDECK_API_KEY" \
     --data-urlencode "query[webhook_id]=$RECOVERY_CONN" --data-urlencode "query[status]=FAILED" \
     | jq '.estimated_count'

   curl -sS -X POST "$API/bulk/events/retry" \
     -H "Authorization: Bearer $HOOKDECK_API_KEY" -H "Content-Type: application/json" \
     -d "{\"query\": {\"webhook_id\": \"$RECOVERY_CONN\", \"status\": \"FAILED\"}}"
   ```

2. **Reconcile critical objects** (orders, payments, refunds) for `T0`–`T1` against the provider's API. Replay restores webhooks Hookdeck captured; reconciliation catches anything that never reached it.
3. **Expect some duplicates.** The provider's own retries may have redelivered outage-window webhooks directly after the fix. Idempotent handlers absorb these.
4. **Record the outcome**: the window, `OP_ID`, counts, and failures. Requests created by the replay can be listed with `hookdeck gateway request list --source-id <recovery source ID> --output json` or by filtering requests on `bulk_retry_id=$OP_ID` via the API.
5. **Leave the standby source connection-less** so it keeps capturing. If the recovery lane was created ad hoc, keep it (idle costs nothing) or delete it: `hookdeck gateway connection delete bfcm-recovery`.
6. If you changed a Terraform-managed rate limit with the CLI, update the Terraform variable to match, or the next `terraform apply` resets it.

## No Hookdeck yet: emergency capture

When webhooks are failing and there is no Hookdeck in the path, the first goal is to **stop losing webhooks** while the endpoint is being fixed.

1. Create a standby source (no connection):

   ```sh
   hookdeck ci --api-key "$HOOKDECK_API_KEY" && hookdeck whoami
   hookdeck gateway source upsert shopify-standby --type WEBHOOK --output json | jq -r '.url'
   ```

2. Add that URL at the provider as an **additional** webhook endpoint or subscription for the same topics. Keep the existing one so direct delivery resumes on its own once fixed. Shopify, Stripe, BigCommerce and PayPal all allow more than one endpoint per topic (see [provider-notes.md](provider-notes.md)).
3. Confirm capture with step 1 above, using the new source ID and the time you registered it as `T0`.
4. Fix the endpoint, then follow steps 2–7.

Webhooks that failed **before** the standby existed are not in Hookdeck. Recover them with the provider's resend tools where they exist (Stripe, PayPal), or by reconciling against the provider's API (Shopify, BigCommerce, WooCommerce).
