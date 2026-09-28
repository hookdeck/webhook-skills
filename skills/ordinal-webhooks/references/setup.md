# Setting Up Ordinal Webhooks

## Prerequisites

- An Ordinal workspace at [app.tryordinal.com](https://app.tryordinal.com) with permission
  to manage integrations
- A **workspace API key** if you are using the API (Settings → Integrations → API, [app.tryordinal.com/settings/integrations/api](https://app.tryordinal.com/settings/integrations/api), sent as
  `Authorization: Bearer <api key>`)
- A publicly reachable HTTPS endpoint (for local development, use the Hookdeck CLI below)

## There Is No Signing Secret to Collect

Unlike Stripe, Shopify or GitHub, **Ordinal issues no signing secret**. The
`POST /webhooks` response returns only `id`, `name`, `url`, `topics` and `createdAt` —
there is no `whsec_` key, no secret field, and nothing to copy out of the dashboard.

**You generate the secret.** Ordinal's only authentication mechanism is the webhook's
optional `headers` field — *"Optional custom headers to include in webhook requests"* —
which Ordinal adds to every delivery verbatim.

### Step 1 — Generate a secret

```bash
openssl rand -hex 32
```

Store it as `ORDINAL_WEBHOOK_SECRET` in your app's environment.

### Step 2 — Choose a header name

The header **name is entirely your choice**; it is **not** an Ordinal-defined header. The
examples in this skill read `x-webhook-secret`, overridable via
`ORDINAL_WEBHOOK_SECRET_HEADER`. Ordinal's own docs example simply shows
`"headers": { "X-Custom-Header": "value" }`.

Inbound header names are case-insensitive and arrive lowercased in Node and Starlette, so
`X-Webhook-Secret` in the webhook config matches `x-webhook-secret` in your handler.

## Register the Webhook via the API (recommended)

Base URL: `https://app.tryordinal.com/api/v1`

```bash
curl -X POST "https://app.tryordinal.com/api/v1/webhooks" \
  -H "Authorization: Bearer your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CRM Sync",
    "description": "Mirror published posts into the CRM",
    "url": "https://example.com/webhooks/ordinal",
    "topics": ["post.published", "post.archived"],
    "headers": { "X-Webhook-Secret": "<the secret from step 1>" }
  }'
```

### `POST /webhooks` body

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `name` | Yes | string | Display name for the webhook |
| `url` | Yes | string (uri) | Your HTTPS endpoint |
| `description` | No | string | Free text |
| `topics` | Yes | `string[]` (min 1) | The event types to subscribe to |
| `headers` | No | object | Header name → value, added to every delivery |

The **Create response omits `description`, `headers` and `createdBy`** — call
`GET /webhooks/{id}` for the full object, where `headers` is `object | null`.

### All webhook management endpoints

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/webhooks` | List webhooks |
| `POST` | `/webhooks` | Create |
| `GET` | `/webhooks/{id}` | Full object, including `headers` |
| `PATCH` | `/webhooks/{id}` | Update — **all fields optional** |
| `DELETE` | `/webhooks/{id}` | Delete |

**`Authorization: Bearer <api key>` is for *calling* Ordinal.** It is never something
Ordinal sends to you, and it is not a webhook secret. Do not compare inbound requests
against your API key.

## Register the Webhook via the Dashboard

Webhooks can also be managed at **Settings → Integrations → Webhooks**
([app.tryordinal.com/settings/integrations/webhooks](https://app.tryordinal.com/settings/integrations/webhooks)):
set the name, URL and the event topics you want.

**The `headers` field is documented on the API; whether the dashboard form exposes custom
headers is not documented.** If the UI has no place to enter headers, set them via the API
instead — `POST /webhooks` when creating, or `PATCH /webhooks/{id}` to add headers to a
webhook you already created in the UI:

```bash
curl -X PATCH "https://app.tryordinal.com/api/v1/webhooks/{id}" \
  -H "Authorization: Bearer your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"headers": {"X-Webhook-Secret": "<the secret>"}}'
```

## Choosing Topics

Subscribe only to what you handle — every topic in `topics` costs you a delivery to
acknowledge. Common starting sets:

| Goal | Topics |
|------|--------|
| Mirror published content | `post.published`, `post.archived`, `post.permanently_deleted` |
| Publishing reliability alerts | `post.publish_failed`, `social_profile.reconnect_needed`, `social_profile.disconnected` |
| Calendar sync | `post.scheduled`, `post.rescheduled`, `post.unscheduled`, `post.content.edited` |
| Review workflow | `post.approval.requested`, `post.approval.approved`, `post.comment.created`, `post.inline_comment.created` |
| Seat provisioning | `invite.created`, `invite.accepted` |

Use the **exact** strings — the underscores in `publish_failed`, `reconnect_needed`,
`permanently_deleted` and `inline_comment` are load-bearing. See
[overview.md](overview.md) for the full list.

## Rotating the Secret

Because the secret is a value **you** put in `headers`, rotation is a `PATCH`:

1. Deploy your handler so it accepts **either** the old or the new secret (keep two env
   vars temporarily and check both with the same constant-time compare).
2. `PATCH /webhooks/{id}` with `{"headers": {"X-Webhook-Secret": "<new secret>"}}`.
3. Confirm deliveries are arriving with the new value, then drop the old secret from your
   handler.

Ordinal documents no rotation window or dual-secret support, and doesn't say whether a
`PATCH` merges into or replaces the existing `headers` object. Send the complete `headers`
object you want (including any other custom headers you rely on), then `GET /webhooks/{id}`
to confirm the result. Step 1 is what prevents a gap.

## Testing

**Ordinal documents no test or `ping` event and no "send test request" button.** To
exercise your handler:

- Perform the real action in the app (create a post, request an approval, add a comment).
- Or replay a saved delivery from your gateway (Hookdeck retains and replays requests).
- Or `curl` your own endpoint with a documented payload from [overview.md](overview.md)
  plus your secret header:

```bash
curl -X POST http://localhost:3000/webhooks/ordinal \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $ORDINAL_WEBHOOK_SECRET" \
  -d '{"type":"post.published","data":{"post":{"id":"550e8400-e29b-41d4-a716-446655440001","title":"Q4 Product Launch Announcement","channel":"LinkedIn"}},"createdAt":"2025-02-26T14:30:00.000Z"}'
```

## Local Development

```bash
npx hookdeck-cli listen 3000 ordinal --path /webhooks/ordinal
```

Use `8000` for the FastAPI example. No account required — the CLI creates a guest account
on first run, gives you a public HTTPS URL to paste into the webhook's `url`, and a web UI
for inspecting and replaying requests.

Hookdeck's `ORDINAL` source type has verification **optional**, and offers the generic
**Basic Auth** and **API Key** (header name + value) checks. Configure the API Key check
with the same header name and value you put in Ordinal's `headers` and Hookdeck will
validate it at the edge. Hookdeck cannot perform HMAC verification for Ordinal because
there is no body-dependent signature.

## Securing an Endpoint With No Signature

The static header proves the caller knows your secret; it does **not** prove the body is
unmodified, because nothing is signed over the body. Add defence in depth:

- **HTTPS only.** The secret is replayable in full if it ever travels in clear text.
- **Never log the header value** or the full request headers at info level.
- **Use an unguessable path** (`/webhooks/ordinal/8f3c…`) so the endpoint is not trivially
  discoverable.
- **Rate-limit and WAF** the route. Ordinal publishes **no source IP ranges**, so an IP
  allowlist is not available — do not invent one.
- **Fail closed** when `ORDINAL_WEBHOOK_SECRET` is unset. See
  [verification.md](verification.md).
