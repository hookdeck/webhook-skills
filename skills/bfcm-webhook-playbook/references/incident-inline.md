# Recovery Runbook: Hookdeck Inline

Use this when the provider sends only to Hookdeck, and a connection delivers to your endpoint. Hookdeck has kept every webhook. Events that couldn't be delivered are retrying on the connection's retry rule, or have `FAILED` after exhausting it. Nothing is lost while the payloads are inside your retention window.

## Variables used below

```sh
export HOOKDECK_API_KEY=...
export API=https://api.hookdeck.com/2026-09-01
export CONN=web_...          # the live connection
export DEST=des_...          # its destination
export SRC=src_...           # its source
export T0=2026-11-27T14:05:00Z   # when deliveries started failing
```

## Step 0 — Authenticate and confirm the project

```sh
hookdeck ci --api-key "$HOOKDECK_API_KEY"
hookdeck whoami
hookdeck gateway connection get "$CONN" --output json | jq '{id, name, paused_at, destination: .destination.id}'
```

Get the user to confirm the project and the connection before changing anything. (`hookdeck ci` also prints "configured on project … in organization …"; if `whoami` errors, show that line instead.) To resolve IDs from names: `hookdeck gateway connection get <name> --output json | jq -r '.id, .destination.id, .source.id'`.

Record the destination's current delivery policy before changing it, so it can be restored exactly in step 5:

```sh
curl -sS "$API/destinations/$DEST" -H "Authorization: Bearer $HOOKDECK_API_KEY" | jq -c '.config.delivery_policy'
```

## Step 1 — Stop hammering the endpoint

Choose one:

- **Pause** if the endpoint is completely down or every delivery makes things worse. New events queue with status `HOLD`; nothing is lost.

  ```sh
  hookdeck gateway connection pause "$CONN"
  ```

- **Lower the delivery rate** if the endpoint is degraded but partly working. This keeps webhooks flowing in order while giving the endpoint room to recover.

  ```sh
  hookdeck gateway destination update "$DEST" --rate-limit 2 --rate-limit-period second
  ```

  For a handler limited by concurrency rather than throughput (slow database, small worker pool), cap in-flight deliveries instead: `--rate-limit 5 --rate-limit-period concurrent`.

## Step 2 — Fix the endpoint

The fix happens outside Hookdeck. Confirm the endpoint is healthy before resuming delivery.

## Step 3 — Set a safe rate, then resume

Set the rate before unpausing. The held backlog plus live traffic arrives together, and the backlog drains at the destination's rate.

```sh
hookdeck gateway destination update "$DEST" --rate-limit 20 --rate-limit-period second
hookdeck gateway connection unpause "$CONN"
```

Unpausing re-queues held events in blocks of up to 5,000 that share one queue timestamp, so order is shuffled inside each block. If order matters more than speed, skip pausing next time and use a low delivery rate instead. See [ordering.md](ordering.md).

## Step 4 — Retry what failed

Events that exhausted their retries during the outage stay `FAILED` until retried. Filter on `last_attempt_at`, not `created_at`: an event created before `T0` that was still queued or retrying when the endpoint went down also failed during the outage. Dry-run, confirm the count with the user, then retry:

```sh
curl -sS --fail-with-body -G "$API/bulk/events/retry/plan" -H "Authorization: Bearer $HOOKDECK_API_KEY" \
  --data-urlencode "query[webhook_id]=$CONN" \
  --data-urlencode "query[status]=FAILED" \
  --data-urlencode "query[last_attempt_at][gte]=$T0" | jq '.estimated_count'

# Only if estimated_count > 0: a bulk operation that matches nothing returns 422, and .id would be empty
export OP_ID=$(curl -sS --fail-with-body -X POST "$API/bulk/events/retry" \
  -H "Authorization: Bearer $HOOKDECK_API_KEY" -H "Content-Type: application/json" \
  -d "{\"query\": {\"webhook_id\": \"$CONN\", \"status\": \"FAILED\", \"last_attempt_at\": {\"gte\": \"$T0\"}}}" \
  | jq -r '.id // empty'); echo "${OP_ID:-no operation created}"
```

The CLI equivalent filter for checking what's left is `hookdeck gateway event list --connection-id "$CONN" --status FAILED --last-attempt-at-after "$T0"`.

Bulk retry walks events oldest first. Like unpause, it queues each block of up to 5,000 events with a shared timestamp. Retried events queue alongside live events, so increase the rate temporarily if the backlog is large and the endpoint has headroom.

Watch progress:

```sh
curl -sS "$API/bulk/events/retry/$OP_ID" -H "Authorization: Bearer $HOOKDECK_API_KEY" \
  | jq '{progress, completed_count, failed_count, completed_at}'
hookdeck gateway event list --connection-id "$CONN" --status FAILED --limit 20 --output json \
  | jq '.models[] | {id, response_status, created_at}'
```

## Step 5 — Mop up

1. Restore the delivery policy recorded in step 0. If it had a rate, set it back with `hookdeck gateway destination update "$DEST" --rate-limit <rate> --rate-limit-period <period>`. If it had none, remove the limit through the API (`--rate-limit 0` is rejected as "no updates"):

   ```sh
   curl -sS --fail-with-body -X PUT "$API/destinations/$DEST" -H "Authorization: Bearer $HOOKDECK_API_KEY" \
     -H "Content-Type: application/json" -d '{"config": {"delivery_policy": null}}' | jq -c '.config.delivery_policy'
   ```

   Do this even if the destination is Terraform-managed: the provider doesn't detect a rate changed outside Terraform, so `terraform apply` won't put it back.
2. Reconcile critical objects for the outage window against the provider's API.
3. Record `T0`, the bulk retry ID, the counts and any events left `FAILED`.

## Requests rejected during the outage

If you also see rejected requests on the source (for example `VERIFICATION_FAILED` after a secret rotation), those created no events. After fixing the cause, retry them in bulk. Retrying a rejected request keeps its ID and re-routes it to the source's current connections:

```sh
curl -sS --fail-with-body -G "$API/bulk/requests/retry/plan" -H "Authorization: Bearer $HOOKDECK_API_KEY" \
  --data-urlencode "query[source_id]=$SRC" --data-urlencode "query[rejection_cause]=VERIFICATION_FAILED" \
  --data-urlencode "query[created_at][gte]=$T0" | jq '.estimated_count'

curl -sS -X POST "$API/bulk/requests/retry" \
  -H "Authorization: Bearer $HOOKDECK_API_KEY" -H "Content-Type: application/json" \
  -d "{\"query\": {\"source_id\": \"$SRC\", \"rejection_cause\": \"VERIFICATION_FAILED\", \"created_at\": {\"gte\": \"$T0\"}}}"
```

Bound the window with `created_at[gte]` (never `gt`, which is ignored). After changing a source's secret, wait about 5 minutes before retrying: verification keeps the old secret for a few minutes, and a retry during that window fails again. Judge the result by `rejection_cause`, not by the operation's `failed_count`. Without it, every `VERIFICATION_FAILED` request in retention is retried, including genuine forgeries from long before the incident; those simply fail verification again.
