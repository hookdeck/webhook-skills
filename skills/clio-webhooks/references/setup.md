# Setting Up Clio Webhooks

## Prerequisites

- A Clio developer application with OAuth 2.0 credentials.
- An OAuth access token with the `webhook` scope **plus** the scope of each model
  you subscribe to (e.g. `matters`, `contacts`).
- A publicly reachable **HTTPS** endpoint. Clio rejects any non-`https` URL.

Clio has **no dashboard UI** for webhooks and **no official server SDK** — you
create and manage webhooks over the REST API.

## Regional Base URLs

Use the base URL for the account's region:

| Region | Base URL |
|--------|----------|
| US | `https://app.clio.com` |
| EU | `https://eu.app.clio.com` |
| Australia | `https://au.app.clio.com` |
| Canada | `https://ca.app.clio.com` |

Examples below use `app.clio.com`.

> **Get this right first — the failure is misleading.** A Clio app exists only in
> the region it was registered in. Calling `/oauth/token` on the wrong host returns
> `invalid_client` ("the client failed to authenticate"), which reads like a wrong
> client secret and sends you hunting in the wrong place. If your app was created at
> `eu.developers.clio.com`, every OAuth **and** API call must use `eu.app.clio.com`.
> Tokens issued in one region are not valid against another.

## Step 1: Create the Webhook

`POST /api/v4/webhooks.json` with a `data` object. Required fields: `url`,
`model`, `fields`. Optional: `events`, `expires_at`.

```bash
curl -X POST https://app.clio.com/api/v4/webhooks.json \
  -H "Authorization: Bearer $CLIO_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "url": "https://your.app/webhooks/clio",
      "model": "matter",
      "fields": "id,etag",
      "events": ["created", "updated", "deleted"],
      "expires_at": "2026-08-20T00:00:00Z"
    }
  }'
```

- `model` accepts the string identifier (`"matter"`) or its numeric ID (`1`).
- `fields` selects which record fields appear in the payload (and, for `updated`,
  which fields are "watched"). Max 1000 characters.
- If `expires_at` is omitted, the webhook expires **3 days** after creation.

## Step 2: Complete the Handshake (Activation)

Immediately after creation (and whenever the `url` changes), Clio POSTs your
endpoint with an `X-Hook-Secret` header containing a generated **shared secret**.
**Clio's docs state the webhook stays disabled until you confirm this handshake.**
There are two ways to confirm:

> **Observed deviation.** In an EU test (July 2026) a newly created webhook moved
> from `pending` to `enabled` on its own within ~90 seconds and began delivering
> events, without any `X-Hook-Secret` request ever reaching the endpoint. Do not
> block your integration on receiving a handshake you may never get — but do
> implement the echo, since it is the documented path and the only way Clio hands
> you the secret in that flow. You can also read `shared_secret` back from
> `GET /api/v4/webhooks/:id.json?fields=shared_secret`.

### Option 1 — Immediate (recommended)

Respond to the handshake POST with `200 OK` and echo the same value back in an
`X-Hook-Secret` response header. This is what the example handlers in this skill
implement.

```
200 OK
X-Hook-Secret: <the secret Clio just sent>
```

### Option 2 — Delayed

Store the secret, then `PUT /api/v4/webhooks/:webhook_id/activate` with the
secret in an `X-Hook-Secret` header.

```bash
curl -X PUT https://app.clio.com/api/v4/webhooks/1234/activate \
  -H "Authorization: Bearer $CLIO_ACCESS_TOKEN" \
  -H "X-Hook-Secret: <the secret Clio just sent>"
```

**Save the secret.** It is the key you will use to verify every later
`X-Hook-Signature`. Store it as `CLIO_WEBHOOK_SECRET` (ideally keyed by
`webhook_id` if you run multiple subscriptions).

## Step 3: Verify Event Signatures

Every event delivery includes an `X-Hook-Signature` header — the HMAC-SHA256
digest of the raw body, keyed with the shared secret. Clio's examples encode
it as lowercase hex (`hexdigest`). See
[verification.md](verification.md).

## Step 4: Renew Before Expiry

Clio does **not** track usage, so an expired webhook silently stops delivering.
The maximum lifetime is 31 days. Renew by updating `expires_at`:

```bash
curl -X PATCH https://app.clio.com/api/v4/webhooks/1234.json \
  -H "Authorization: Bearer $CLIO_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"data": {"expires_at": "2026-09-15T00:00:00Z"}}'
```

Schedule renewals (e.g. a daily job that extends webhooks nearing expiry).

## Managing Webhooks

```bash
# List webhooks
curl https://app.clio.com/api/v4/webhooks.json \
  -H "Authorization: Bearer $CLIO_ACCESS_TOKEN"

# Delete a webhook
curl -X DELETE https://app.clio.com/api/v4/webhooks/1234.json \
  -H "Authorization: Bearer $CLIO_ACCESS_TOKEN"
```

## Local Testing

Create a Clio source in Hookdeck Event Gateway and forward it to your local
server with the Hookdeck CLI, where `clio` is the source's name:

```bash
hookdeck listen 3000 clio --path /webhooks/clio
```

Point your webhook's `url` at the source URL, then create the webhook. Event
Gateway answers the `X-Hook-Secret` handshake itself and doesn't forward it, so
read the secret with `GET /api/v4/webhooks/:id.json?fields=shared_secret`.
Event deliveries are forwarded to your local handler, where you can inspect and
replay them.
