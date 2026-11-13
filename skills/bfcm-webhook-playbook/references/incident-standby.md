# Recovery Runbook: Standby Capture

Use this when the provider delivers to your endpoint directly **and** to a Hookdeck source with **no connection** (the standby source), and your endpoint has failed. Hookdeck has been recording every webhook as a request rejected with cause `NO_CONNECTION`. Recovery replays those requests, oldest first, into a separate **recovery lane** (its own source, destination and connection) that delivers to your fixed endpoint at a controlled rate.

If you have no Hookdeck at all, start with [No Hookdeck yet: emergency capture](#no-hookdeck-yet-emergency-capture).

## Why a separate recovery lane

Do **not** attach a connection to the standby source to drain the backlog:

- Live webhooks would start flowing through it immediately, ahead of the older backlog that bulk replay is still working through, so new events land before old ones.
- The provider also delivers live traffic directly to your endpoint, so every live webhook would arrive twice.
- The standby source must stay connection-less so it keeps capturing for the next incident.

Bulk replay can target a connection on a **different** source, so the backlog goes to the recovery lane and nothing else does.

## Filter rules that matter

These are easy to get wrong, and getting them wrong replays the wrong requests to production:

- **Filter on `rejection_cause=NO_CONNECTION` only.** Don't add `status=rejected`: the API turns `status=rejected` into "any rejection cause", which replaces the `NO_CONNECTION` filter. Forged or unverifiable requests (`VERIFICATION_FAILED`) would then be replayed too.
- **Use `created_at[gte]` and `created_at[lte]` only.** `created_at[gt]` and `[lt]` are accepted but **ignored**, for requests and events alike. A window written with `gt` has no lower bound and replays everything in retention.
- **Stored timestamps are more precise than filters.** Filters are applied at millisecond precision; stored `created_at` values carry microseconds. A `gte` equal to a request's own `created_at` includes that request.

## Variables used below

```sh
export HOOKDECK_API_KEY=...                         # project API key
export API=https://api.hookdeck.com/2026-09-01
export T0=2026-11-27T14:05:00Z                      # last webhook your system processed successfully
# Set in the steps below: STANDBY_SRC, RECOVERY_CONN, RECOVERY_DEST, T1, FIRST_ID, FIRST_AT, OP_ID
```

The commands use `jq`. CLI list commands print `{"models": [...], "pagination": {...}}`; `get` commands print the object. List commands return 100 results by default; pass `--next "$(... | jq -r .pagination.next)"` for more.

## Step 0 — Authenticate, confirm the project, resolve IDs

```sh
hookdeck ci --api-key "$HOOKDECK_API_KEY"
hookdeck whoami
```

Show the output to the user and get confirmation that this is the right organization and project before going further. (`hookdeck ci` also prints "configured on project … in organization …"; if `whoami` errors, show that line instead.) Then resolve IDs from names:

```sh
export STANDBY_SRC=$(hookdeck gateway source get shopify-standby --output json | jq -r .id)
hookdeck gateway connection list --source-id "$STANDBY_SRC" --output json | jq '.models | length'   # must be 0
```

If the standby source has a connection, stop and tell the user: something already delivers from it, and this runbook assumes it doesn't.

## Step 1 — Confirm Hookdeck is capturing, and fix T0

```sh
hookdeck gateway request list \
  --source-id "$STANDBY_SRC" --rejection-cause NO_CONNECTION \
  --created-after "$T0" --order-by created_at --dir desc --limit 5 --output json \
  | jq '.models[] | {id, created_at}'
```

- Recent requests listed: capture is working. Carry on.
- Nothing since `T0`: the provider is not sending to the standby source (subscription missing, or wrong URL). Fix that first. Anything not captured has to come from provider resend or reconciliation (see [provider-notes.md](provider-notes.md)).
- Many `VERIFICATION_FAILED` requests: the standby source's signing secret doesn't match what the provider signs with. They won't be replayed. Fix the secret, then [retry those requests](#verification_failed-on-the-standby-source) before replaying.

Agree `T0` with the user: the time of the last webhook your system definitely processed. When unsure, pick an earlier time. Handlers are idempotent, so replaying a few already-processed webhooks costs little; missing some costs orders.

## Step 2 — Fix the endpoint, then fix T1

The fix itself happens outside Hookdeck. Before continuing, confirm the endpoint is healthy (health check, error rate back to normal).

`T1` is the moment live delivery resumed. Pick one path:

- **Direct delivery resumed** (your endpoint is accepting the provider's own deliveries again): `T1` is when the first direct delivery succeeded. If the provider deleted or disabled your direct subscription (Shopify deletes Admin-API subscriptions after repeated failures; see [provider-notes.md](provider-notes.md)), recreate it first, then take `T1` from then.
- **Moving to Hookdeck inline from now on:** at `T1`, add a live connection from the standby source to your endpoint **and** remove or disable the provider's direct subscription to your endpoint. Do both, or every live webhook arrives twice. The source is no longer a standby; create a new standby source after the incident if you still want one.

Add a few minutes to `T1` as a safety margin. Your endpoint's clock and Hookdeck's `created_at` won't line up exactly, and a few duplicates are cheaper than a gap.

If `T1` isn't known yet, leave it unset and omit `lte` in step 5. The bulk operation then stops at the moment it was created. Run a second window later, as described in [Replaying in more than one window](#replaying-in-more-than-one-window).

## Step 3 — Create the recovery lane

Skip this if it was pre-provisioned in preparation ([terraform.md](terraform.md)); just look up the IDs.

```sh
hookdeck gateway connection upsert bfcm-recovery \
  --source-name bfcm-recovery --source-type WEBHOOK \
  --source-config "{\"auth_type\":\"API_KEY\",\"auth\":{\"header_key\":\"x-api-key\",\"api_key\":\"$(openssl rand -hex 32)\"}}" \
  --destination-name orders-api-recovery --destination-type HTTP \
  --destination-url https://api.example.com/webhooks/shopify \
  --destination-rate-limit 10 --destination-rate-limit-period second \
  --rules '[{"type":"retry","strategy":"exponential","count":10,"interval":60000,"response_status_codes":["429","500-599"]}]'

export RECOVERY_CONN=$(hookdeck gateway connection get bfcm-recovery --output json | jq -r .id)
export RECOVERY_DEST=$(hookdeck gateway connection get bfcm-recovery --output json | jq -r .destination.id)
```

- **The recovery source must require authentication** (API-key auth via `--source-config` above; the key itself is never used). Don't use the `--source-api-key` shortcut: on a `WEBHOOK` source the API rejects it (`source.config.auth is not allowed`). Likewise, pass retry status-code ranges like `500-599` via `--rules` JSON; `--rule-retry-response-status-codes` only accepts single codes. Its connection delivers straight to production with a valid Hookdeck signature, so an open source would let anyone with its URL inject webhooks. Replay skips source verification, so the key doesn't block replays.
- Set the rate from what the endpoint can take **on top of live traffic**, not its total capacity. Live traffic is still arriving directly.
- Keep the recovery destination separate from any live destination so its rate limit and pausing don't affect live delivery.
- Don't add deduplication or delay rules to the recovery connection; they would drop or hold replayed events.

## Step 4 — Canary: replay the oldest request alone

```sh
FIRST=$(hookdeck gateway request list \
  --source-id "$STANDBY_SRC" --rejection-cause NO_CONNECTION \
  --created-after "$T0" --order-by created_at --dir asc --limit 1 --output json)
export FIRST_ID=$(echo "$FIRST" | jq -r '.models[0].id')
export FIRST_AT=$(echo "$FIRST" | jq -r '.models[0].created_at')

CANARY_EVENT=$(curl -sS -X POST "$API/requests/$FIRST_ID/replay" \
  -H "Authorization: Bearer $HOOKDECK_API_KEY" -H "Content-Type: application/json" \
  -d "{\"webhook_ids\": [\"$RECOVERY_CONN\"]}" | jq -r '.events[0].id')

# Poll until the canary reaches a final status
for i in $(seq 1 30); do
  STATUS=$(hookdeck gateway event get "$CANARY_EVENT" --output json | jq -r .status)
  echo "$STATUS"; [ "$STATUS" = SUCCESSFUL ] || [ "$STATUS" = FAILED ] && break; sleep 10
done
hookdeck gateway event get "$CANARY_EVENT" --output json | jq '{status, response_status}'
```

Expect `SUCCESSFUL`. If the event is retrying or `FAILED`, stop and diagnose before replaying anything else:

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `401`/`400` from your handler, signature error in logs | The handler checks the provider signature against the **direct** endpoint's secret, but the payload came through the standby endpoint, which for Stripe, PayPal and WooCommerce has its own secret. Or the signature's timestamp is older than the tolerance (Stripe SDKs default to 5 minutes) | Accept the standby endpoint's secret as well, or verify the Hookdeck signature (`x-hookdeck-signature`), which is safe because the standby source verified the provider signature at capture. Widening a timestamp tolerance alone does not fix a secret mismatch |
| `403` | The endpoint or a firewall allowlists the provider's IP addresses; recovery deliveries come from Hookdeck | Allow Hookdeck's outbound IPs for the recovery window |
| `5xx` or timeout | Endpoint not actually healthy | Back to step 2 |
| `409 DATA_ARCHIVED` from the replay call | Payload is outside the retention window | Use provider resend or API reconciliation for that period |

## Step 5 — Replay the backlog

Choose a mode with the user first (see [ordering.md](ordering.md)):

- **5a. Ordered replay:** exact capture order, about 4–5 requests a second (around 14,000 an hour). Use it when handlers are order-sensitive or the backlog is modest.
- **5b. Bulk replay:** one API call, much faster to enqueue. Order is kept between batches of 100 but is effectively random within each batch. Use it for large backlogs with order-tolerant handlers.

Either way, **wait about a minute after `T1` before counting or replaying.** Requests from the last few seconds can be missing from counts and listings.

### Dry run (both modes)

The window starts **at** the canary's `created_at` (`gte`). Bulk replay therefore delivers the canary a second time, which is deliberate: excluding it would need a `gt` bound, and the API ignores `gt`. Ordered replay skips it by ID instead.

```sh
curl -sS --fail-with-body -G "$API/bulk/requests/replay/plan" -H "Authorization: Bearer $HOOKDECK_API_KEY" \
  --data-urlencode "query[source_id]=$STANDBY_SRC" \
  --data-urlencode "query[rejection_cause]=NO_CONNECTION" \
  --data-urlencode "query[created_at][gte]=$FIRST_AT" \
  --data-urlencode "query[created_at][lte]=$T1" | jq '{estimated_count, estimated_batch}'
```

Without an `lte` bound (`T1` unknown), the count is a lower bound while webhooks are still arriving: the operation includes everything up to its own creation time. Reconcile against the operation's `completed_count` afterwards.

**Sanity-check `estimated_count` before asking for confirmation.** Compare it with what the outage should have produced: normal webhook rate × outage length, or the provider dashboard's count for the window. If it is far higher, the window is wrong (a missing lower bound, or the wrong source). Stop and recheck the query. If it is 0, there is nothing to replay; don't create an operation. Otherwise show the count and the chosen mode to the user and get explicit confirmation.

### 5a. Ordered replay

Set the recovery destination to deliver one event at a time, then replay each request in turn, oldest first. Each replay completes before the next starts, so events queue in their original order.

```sh
hookdeck gateway destination update "$RECOVERY_DEST" --rate-limit 1 --rate-limit-period concurrent

: > replayed.log                                   # one line per replayed request: id created_at
NEXT=""
while :; do
  PAGE=$(hookdeck gateway request list --source-id "$STANDBY_SRC" --rejection-cause NO_CONNECTION \
    --created-after "$FIRST_AT" --created-before "$T1" --order-by created_at --dir asc --limit 100 \
    ${NEXT:+--next "$NEXT"} --output json)
  for ROW in $(echo "$PAGE" | jq -r '.models[] | "\(.id)|\(.created_at)"'); do
    ID=${ROW%%|*}; AT=${ROW#*|}
    [ "$ID" = "$FIRST_ID" ] && continue            # already replayed as the canary
    while :; do
      CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$API/requests/$ID/replay" \
        -H "Authorization: Bearer $HOOKDECK_API_KEY" -H "Content-Type: application/json" \
        -d "{\"webhook_ids\": [\"$RECOVERY_CONN\"]}")
      [ "$CODE" = 429 ] && { sleep 5; continue; }   # API rate limit: wait and retry the same request
      break
    done
    [ "$CODE" = 200 ] || { echo "Replay of $ID failed with $CODE; stopping"; break 2; }
    echo "$ID $AT" >> replayed.log
  done
  NEXT=$(echo "$PAGE" | jq -r '.pagination.next // empty'); [ -n "$NEXT" ] || break
done
wc -l < replayed.log
```

- `replayed.log` is the resume point. If the loop stops, fix the cause, then restart it with `--created-after` set to the last `created_at` in the log. That request is then replayed once more; everything before it is not.
- The count in `replayed.log` plus the canary should equal the dry-run `estimated_count`.
- If `T1` isn't fixed yet, use the loop's start time for `--created-before`, then run another window later (see [Replaying in more than one window](#replaying-in-more-than-one-window)).

### 5b. Bulk replay

```sh
OP=$(curl -sS --fail-with-body -X POST "$API/bulk/requests/replay" \
  -H "Authorization: Bearer $HOOKDECK_API_KEY" -H "Content-Type: application/json" \
  -d "{
    \"query\": {
      \"source_id\": \"$STANDBY_SRC\",
      \"rejection_cause\": \"NO_CONNECTION\",
      \"created_at\": { \"gte\": \"$FIRST_AT\", \"lte\": \"$T1\" },
      \"target\": { \"webhook_ids\": [\"$RECOVERY_CONN\"] }
    }
  }")
echo "$OP" | jq 'if .id then {id, estimated_count} else (.data.message // .message // .) end'   # prints the API's error message on failure
export OP_ID=$(echo "$OP" | jq -r '.id // empty'); [ -n "$OP_ID" ] || echo "No operation created; read the error above"
```

If `T1` isn't fixed yet, drop `query[created_at][lte]` from the plan and the `"lte"` key from the body. Don't pass an empty value; the API rejects it.

Record the mode, `OP_ID` (bulk) or `replayed.log` (ordered), `FIRST_ID`, `FIRST_AT`, `T0` and `T1` (or the operation's `created_at`, if there was no `lte`) in the incident notes now.

## Step 6 — Watch and control the pace

```sh
# Bulk operation progress (repeat every minute or so)
curl -sS "$API/bulk/requests/replay/$OP_ID" -H "Authorization: Bearer $HOOKDECK_API_KEY" \
  | jq '{progress, completed_count, failed_count, in_progress, completed_at, created_at}'

# Delivery health on the recovery lane
hookdeck gateway event list --connection-id "$RECOVERY_CONN" --status FAILED \
  --created-after "$FIRST_AT" --limit 20 --output json \
  | jq '.models[] | {id, response_status, created_at}'
```

If the endpoint struggles:

```sh
# Slow down (preferred: keeps order intact)
hookdeck gateway destination update "$RECOVERY_DEST" --rate-limit 5 --rate-limit-period second

# Emergency hold: events are kept, not lost. Unpausing re-queues in large blocks (see ordering.md)
hookdeck gateway connection pause bfcm-recovery
hookdeck gateway connection unpause bfcm-recovery
```

For ordered replay (5a), watch the loop's output and the recovery lane's events; the rest of this section is about bulk replay.

**If progress stalls** (`completed_count` unchanged for 10+ minutes while `in_progress` is true):

1. Cancel the operation: `curl -sS -X POST "$API/bulk/requests/replay/$OP_ID/cancel" -H "Authorization: Bearer $HOOKDECK_API_KEY"`.
2. Record the operation ID and its last progress, and contact Hookdeck support with them.
3. Never start a second operation over the same window while the first is still in progress. Both would deliver.

**Resuming after a cancel:** a cancelled operation can stop partway through a batch, and it doesn't report which request it reached. Re-run the same window from its original `gte` and accept the duplicates for the part that already ran. For a very large backlog, replay in bounded windows (for example one hour each) from the start, so a cancel costs at most one window's worth of duplicates.

## Step 7 — Mop up

Wait until the replay has finished (bulk: the operation reports `completed_at`; ordered: the loop has ended) and the recovery lane has drained (no `QUEUED` events left for the connection):

```sh
hookdeck gateway event list --connection-id "$RECOVERY_CONN" --status QUEUED --limit 1 --output json | jq '.models | length'
```

1. **Retry deliveries that failed on the recovery lane during this recovery**, bounded to this run, so failures from earlier incidents aren't retried:

   ```sh
   curl -sS --fail-with-body -G "$API/bulk/events/retry/plan" -H "Authorization: Bearer $HOOKDECK_API_KEY" \
     --data-urlencode "query[webhook_id]=$RECOVERY_CONN" --data-urlencode "query[status]=FAILED" \
     --data-urlencode "query[created_at][gte]=$FIRST_AT" | jq '.estimated_count'

   # Only if estimated_count > 0: a bulk operation that matches nothing returns 422
   curl -sS --fail-with-body -X POST "$API/bulk/events/retry" \
     -H "Authorization: Bearer $HOOKDECK_API_KEY" -H "Content-Type: application/json" \
     -d "{\"query\": {\"webhook_id\": \"$RECOVERY_CONN\", \"status\": \"FAILED\", \"created_at\": {\"gte\": \"$FIRST_AT\"}}}" \
     | jq -r '.id'
   ```

   Here `FIRST_AT` works as a lower bound because every event on the recovery lane from this run was created after the canary replay. Bulk event retry shuffles order within blocks of up to 5,000 (see [ordering.md](ordering.md)); for a handful of order-sensitive failures, retry them one at a time instead with `hookdeck gateway event retry <id>`, oldest first.

2. **Reconcile critical objects** (orders, payments, refunds) for `T0`–`T1` against the provider's API. Replay restores webhooks Hookdeck captured; reconciliation catches anything that never reached it.
3. **Expect some duplicates.** They come from the canary, the `T1` margin, and the provider's own retries redelivering outage-window webhooks directly after the fix. Idempotent handlers absorb them.
4. **Record the outcome**: the window, mode, `OP_ID` or `replayed.log`, counts and failures. Requests created by a bulk replay can be listed with `GET $API/requests?bulk_retry_id=$OP_ID`.
5. **Leave the standby source connection-less** so it keeps capturing (unless you moved to inline in step 2). If the recovery lane was created ad hoc, keep it (an idle lane costs nothing) or, with the user's approval, delete it by ID: `hookdeck gateway connection delete "$RECOVERY_CONN" --force`. The command can't prompt without a terminal, so an agent needs `--force`, and must get the user's approval before running it.
6. **Reset any rate limit you changed** (for example, the `concurrent` 1 used by ordered replay). If the destination is Terraform-managed, don't rely on `terraform apply` to fix it: the provider doesn't detect a rate changed outside Terraform. Set the value back with the CLI, or change the variable and apply.

## Replaying in more than one window

Use more than one window when `T1` wasn't known at the first replay, or to replay a large backlog in bounded chunks. Each window's `gte` must equal the previous window's upper bound:

- If the previous window had an explicit `lte`, use that value.
- If it had no `lte`, use the previous bulk operation's `created_at` (from `GET $API/bulk/requests/replay/<id>`). The server capped that operation at its own creation time.

Because filters are millisecond-precise and stored values microsecond-precise, an `lte` and a following `gte` with the same value neither gap nor (in practice) overlap. Never start a window from a value later than the previous upper bound, and never use `gt`.

## VERIFICATION_FAILED on the standby source

If the standby source's secret was wrong, genuine webhooks were captured as `VERIFICATION_FAILED` instead of `NO_CONNECTION`, and step 5 won't replay them. Retrying them on the standby source re-runs verification; with no connection they then become `NO_CONNECTION` and fall inside the replay window.

1. **Fix the secret**, passing the source type as well. Without `--type`, the upsert is treated as a generic source and fails with `config.auth is not allowed`, leaving the old secret in place:

   ```sh
   hookdeck gateway source upsert <standby name> --type SHOPIFY --webhook-secret "$CORRECT_SECRET"   # or STRIPE, etc.
   ```

   Check the command printed no error before waiting.
2. **Wait 5–6 minutes.** Hookdeck needs time to pick up a new secret everywhere. Measured: the edge kept rejecting correctly signed webhooks with `401` for up to about a minute. For about 4 more minutes it accepted them (`200`) while they were still stored as `VERIFICATION_FAILED`. They became `NO_CONNECTION` from about 5 minutes. A retry during that window fails again.
3. **Confirm the fix:** trigger a provider test webhook and check it is stored as `NO_CONNECTION`, not `VERIFICATION_FAILED`. If it isn't, wait another minute and repeat; don't retry until a test webhook passes:

   ```sh
   hookdeck gateway request list --source-id "$STANDBY_SRC" --limit 1 --output json \
     | jq '.models[0] | {id, rejection_cause, created_at}'
   ```
4. **Retry, with no upper bound**, so the window also covers requests captured while the secret was propagating:

   ```sh
   curl -sS --fail-with-body -G "$API/bulk/requests/retry/plan" -H "Authorization: Bearer $HOOKDECK_API_KEY" \
     --data-urlencode "query[source_id]=$STANDBY_SRC" \
     --data-urlencode "query[rejection_cause]=VERIFICATION_FAILED" \
     --data-urlencode "query[created_at][gte]=$T0" | jq '.estimated_count'

   # After the user confirms the count:
   curl -sS --fail-with-body -X POST "$API/bulk/requests/retry" \
     -H "Authorization: Bearer $HOOKDECK_API_KEY" -H "Content-Type: application/json" \
     -d "{\"query\": {\"source_id\": \"$STANDBY_SRC\", \"rejection_cause\": \"VERIFICATION_FAILED\", \"created_at\": {\"gte\": \"$T0\"}}}" \
     | jq -r '.id'
   ```

5. **Check the outcome by rejection cause, not by the operation's `failed_count`.** `failed_count` counts every request that is still rejected afterwards, and `NO_CONNECTION` is a rejection too, so it reads 100% even when the retry worked. Count both causes for the window, before and after the retry:

   ```sh
   for CAUSE in NO_CONNECTION VERIFICATION_FAILED; do
     echo "$CAUSE: $(hookdeck gateway request list --source-id "$STANDBY_SRC" --rejection-cause $CAUSE \
       --created-after "$T0" --limit 100 --output json | jq '.models | length')"
   done
   ```

   Success: `VERIFICATION_FAILED` drops by the plan count (to 0, or to the genuine forgeries), and `NO_CONNECTION` rises by the same amount. Retried requests keep their original `created_at`, so they fall inside the replay window. For more than 100, page with `--next`.

Requests that still fail verification after this are genuinely not from the provider. Leave them.

## No Hookdeck yet: emergency capture

When webhooks are failing and there is no Hookdeck in the path, the first goal is to **stop losing webhooks** while the endpoint is being fixed.

1. Create a standby source with **provider signature verification** and no connection. Verification means forged requests are stored as `VERIFICATION_FAILED` and never replayed:

   ```sh
   hookdeck ci --api-key "$HOOKDECK_API_KEY" && hookdeck whoami
   SRC_JSON=$(hookdeck gateway source upsert shopify-standby --type SHOPIFY \
     --webhook-secret "$SHOPIFY_APP_CLIENT_SECRET" --output json)
   export STANDBY_SRC=$(echo "$SRC_JSON" | jq -r .id)
   export STANDBY_URL=$(echo "$SRC_JSON" | jq -r .url)
   ```

   For Stripe, register the endpoint first (step 2), then set the source's secret to **that endpoint's** signing secret (`whsec_...`). Each Stripe endpoint has its own: `hookdeck gateway source upsert stripe-standby --type STRIPE --webhook-secret "$STANDBY_WHSEC"`.

2. Add `$STANDBY_URL` at the provider as an **additional** webhook endpoint or subscription for the same topics and, for Stripe, the same API version as the direct one. Keep the existing one so direct delivery resumes on its own once fixed. Shopify, Stripe, BigCommerce and PayPal all allow more than one endpoint per topic (see [provider-notes.md](provider-notes.md)).
3. Confirm capture with step 1, using the time you registered the URL as `T0`. For up to a minute after a source is created, the edge may answer `200` with `"status": "NOTICE"` ("Unknown source ... it can take a minute to propagate") instead of `SUCCESS`. The request is still processed; check the request list rather than the response body.
4. Fix the endpoint, then follow steps 2–7.

Webhooks that failed **before** the standby existed are not in Hookdeck. Recover them with the provider's resend tools where they exist (Stripe, PayPal), or by reconciling against the provider's API (Shopify, BigCommerce, WooCommerce).
