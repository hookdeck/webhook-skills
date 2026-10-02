# Setting Up Polytomic Webhooks

## Prerequisites

- A Polytomic account with permission to create **Connections** and **Syncs**
- A publicly reachable HTTPS endpoint (or a tunnel — see
  [Receiving webhooks locally](#receiving-webhooks-locally))

## How the Pieces Fit

Polytomic's webhook surface is a **destination connection**, not an event
subscription. Two objects are involved:

1. **A Webhook connection** — holds the delivery URL and the Secret.
2. **A Model Sync** — holds the source model, the selected fields, the schedule,
   and the Advanced settings. The sync is what actually sends.

A connection on its own delivers nothing. You need a sync pointed at it.

## Create the Webhook Connection

Verbatim steps from the docs:

1. In Polytomic, go to **Connections** → **Add Connection** → **Webhook**.
2. Enter the URL that you'd like Polytomic to deliver payloads to.
3. *"Polytomic will give you a secret key that you will be able to use to verify
   incoming payloads with. Hovering over the secret key field will reveal its
   value."*

## Get Your Secret

**Hover over the secret key field in the connection to reveal its value.**

Important framing, because the docs' wording invites a wrong implementation:

- The docs call it a key you can *"verify incoming payloads with"*, but there is
  **no signing and no HMAC**. Polytomic simply sends this exact value back to you
  as `Authorization: Bearer <secret>` on every request.
- So it is a **shared bearer credential**, not a signing secret. Store it as
  `POLYTOMIC_WEBHOOK_SECRET` and compare it in constant time. See
  [verification.md](verification.md).
- The value observed in the docs' example looks like a JWT. **Treat it as an
  opaque string** — do not parse or validate it.

## Create the Sync

Once the connection exists, create a Model Sync targeting it and **select the
fields you want delivered**. Those selections become the keys inside
`object.records[].fields` — which is exactly why `fields` has no fixed schema.

`object.name` will be the sync's name, and `object.id` its UUID — *"It will match
the value seen the URL bar when you have the corresponding sync configuration
open."* Both are useful when several syncs post to the same endpoint.

## No Handshake or Validation Request

**No handshake, challenge, echo or validation request is documented.** Polytomic
does not ping your URL to confirm it when you create the connection, and there is
no "send test event" button documented. To exercise the real path, run the sync.

## Advanced Settings

At the bottom of the sync configuration is an **Advanced settings** section.
Each of these changes delivery semantics:

### Webhook batch size (default: 100)

*"Polytomic's default batch size when sending to your webhook is 100. You can
override this with a webhook batch size of your choice."*

Your handler must **loop over `object.records`** and must not assume one record.
Because the value is user-configurable, write for large batches too — acknowledge
with 200 first, then process.

### Metadata (default: null)

*"You can specify extra hardcoded keys and values for Polytomic to include in its
webhook payload."* These appear as `object.metadata`.

Because the default is `null`, **`metadata` may be an object, `null`, or absent
entirely**. Handle all three. Useful for tagging which environment or tenant a
sync belongs to.

### Capture webhook requests and responses (default: true)

*"Leaving this on means you'll get to see a log of each request and response in
the Polytomic sync history view."*

**This is your primary debugging surface.** When a delivery 401s or 500s, open
the sync history to see the exact request Polytomic sent and the response it got
back. Note that it logs request bodies, so consider whether that is appropriate
for sensitive fields.

### Always do a full sync (default: false)

*"Polytomic's Model Syncs are by default differential: only updates/new rows are
synced. You can turn this off and have Polytomic always sync everything in the
source."*

With the default (off), `records` holds only changes. Turning it on re-delivers
**everything on every run** — a much heavier load, and a reason to make your
handler idempotent on `records[].hash`.

### Skip backfill on first sync (default: false)

*"The first time a Polytomic Model Sync runs, it will sync everything in the
source. Subsequent syncs will be automatically differential. You can have
Polytomic skip the initial backfill and only sync diffs going forward by setting
this to true."*

> **This is the single most common cause of an unexpectedly huge first batch.** If
> your first webhook delivery floods your endpoint, this is almost certainly why.
> Either enable this setting, or make sure the endpoint acknowledges fast and
> queues the work.

## Firewall: Source IPs

If your API sits behind a firewall, the webhooks page points you at
[docs.polytomic.com/docs/whitelist-ips](https://docs.polytomic.com/docs/whitelist-ips):

```
54.190.82.25
44.232.40.21
35.155.106.54
54.200.67.134
44.224.213.129
54.149.95.139
```

Three honest caveats:

1. **That page is framed around a different purpose.** Verbatim: *"When
   connecting Polytomic to your databases, data warehouses, and cloud storage
   buckets, you may need to whitelist our IP addresses."*
   The webhooks page merely links to it for webhook traffic. Present it as **the
   allowlist Polytomic points you at**, not as a documented webhook-egress range.
2. **It does not apply to self-hosted / on-premise Polytomic.** Verbatim from
   that page: *"If you're hosting Polytomic yourself, note that the IP addresses
   below don't apply to you."* Allowlist your own infrastructure's addresses
   instead.
3. **It is a firewall convenience, not authentication.** Source IPs can't
   establish that a request came from your Polytomic workspace. Keep the bearer
   token check regardless.

## Environment Variables

```bash
# REQUIRED. The connection Secret (hover the secret key field to reveal it).
# Polytomic sends it back verbatim as `Authorization: Bearer <secret>`.
# NOT a signing secret — there is no HMAC. Unset => handler fails closed (500).
POLYTOMIC_WEBHOOK_SECRET=

# OPTIONAL. Freshness window for Polytomic-Signature-Timestamp, in seconds.
# Default 300. Set to 0 to disable. Defence-in-depth only.
POLYTOMIC_TIMESTAMP_TOLERANCE_SECONDS=300
```

## Receiving Webhooks Locally

```bash
npx hookdeck-cli listen 3000 polytomic --path /webhooks/polytomic
```

(Use `8000` instead of `3000` for the FastAPI example.)

No account required — the CLI creates a guest account on first run and gives you a
public HTTPS URL plus a web UI for inspecting requests. Paste that URL into the
Webhook connection, then run your sync.

Because Polytomic sends no signature, there is nothing for a gateway to verify on
the **Polytomic → gateway** hop. What a gateway adds here is an unguessable
source URL, plus the retries and replay Polytomic itself does not document — which
matters, because a single 5xx marks the whole sync run failed.

## Rotating the Secret

The docs do not document a rotation flow or a dual-secret overlap window. Treat
rotation as: update the connection's Secret in Polytomic, then update
`POLYTOMIC_WEBHOOK_SECRET` — and expect a window where deliveries 401 (and
therefore the sync shows failures) unless your handler temporarily accepts both
the old and new value. Checking two candidate secrets in constant time is a
reasonable local pattern; it is not something Polytomic documents.

## Testing Your Endpoint by Hand

There is no documented test event, so replay the documented payload yourself:

```bash
curl -X POST http://localhost:3000/webhooks/polytomic \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $POLYTOMIC_WEBHOOK_SECRET" \
  -H "Polytomic-Signature-Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -d '{
    "event": "sync.records",
    "object": {
      "id": "1ea8f90a-b22e-4218-86d5-c3c109e1fbb7",
      "name": "Webhook HTTP Endpoint sync",
      "records": [
        {
          "hash": "b7421c6c57bd49f7",
          "fields": { "email": "nathan@polytomic.com", "last_login": "2020-12-02T00:00:00Z" }
        }
      ],
      "metadata": {}
    }
  }'
```

Note the timestamp format: **RFC 3339 UTC**, e.g. `2021-06-01T22:55:36Z` — not a
Unix epoch integer.
