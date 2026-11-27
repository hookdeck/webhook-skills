# Setting Up Ordinal Webhooks

## Prerequisites

- An Ordinal workspace at [app.tryordinal.com](https://app.tryordinal.com) with permission
  to manage integrations
- A **workspace API key** if you are using the API (Settings → Integrations → API,
  [app.tryordinal.com/settings/integrations/api](https://app.tryordinal.com/settings/integrations/api)),
  sent as `Authorization: Bearer <api key>`
- A publicly reachable HTTPS endpoint (for local development, use the Hookdeck CLI below)

## Register the Webhook in the Dashboard

Go to **Settings → Integrations → Webhooks**
([app.tryordinal.com/settings/integrations/webhooks](https://app.tryordinal.com/settings/integrations/webhooks)),
set the name, URL and event topics, and save. Copy the **signing secret** from the
webhook's configure page and store it as `ORDINAL_WEBHOOK_SECRET`.

## Register the Webhook via the API

Base URL: `https://app.tryordinal.com/api/v1`

```bash
curl -X POST "https://app.tryordinal.com/api/v1/webhooks" \
  -H "Authorization: Bearer your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CRM Sync",
    "description": "Mirror published posts into the CRM",
    "url": "https://example.com/webhooks/ordinal",
    "topics": ["post.published", "post.archived"]
  }'
```

The response includes `signingSecret` (it starts with `whsec_`). **Save it now**:
`GET /webhooks` and `GET /webhooks/{id}` omit it. You can copy it again later from the
webhook's configure page in the dashboard.

### `POST /webhooks` body

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `name` | Yes | string | Display name for the webhook |
| `url` | Yes | string (uri) | Your HTTPS endpoint |
| `description` | No | string | Free text |
| `topics` | Yes | `string[]` | The event types to subscribe to |
| `headers` | No | object | Optional static headers added to every delivery |

The Create response returns `id`, `name`, `url`, `topics`, `signingSecret` and
`createdAt`. It omits `description`, `headers` and `createdBy`; call `GET /webhooks/{id}`
for those.

### All webhook management endpoints

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/webhooks` | List webhooks (no `signingSecret`) |
| `POST` | `/webhooks` | Create; returns `signingSecret` |
| `GET` | `/webhooks/{id}` | Full object (no `signingSecret`) |
| `PATCH` | `/webhooks/{id}` | Update; all fields optional |
| `DELETE` | `/webhooks/{id}` | Delete |

**`Authorization: Bearer <api key>` is for calling Ordinal.** Ordinal never sends it to
you, and it isn't the webhook's signing secret.

## Choosing Topics

Subscribe only to what you handle. Common starting sets:

| Goal | Topics |
|------|--------|
| Mirror published content | `post.published`, `post.archived`, `post.permanently_deleted` |
| Publishing reliability alerts | `post.publish_failed`, `social_profile.reconnect_needed`, `social_profile.disconnected` |
| Calendar sync | `post.scheduled`, `post.rescheduled`, `post.unscheduled`, `post.content.edited` |
| Review workflow | `post.approval.requested`, `post.approval.approved`, `post.comment.created`, `post.inline_comment.created` |
| Seat provisioning | `invite.created`, `invite.accepted` |
| LinkedIn engagement | `linkedin.monitoring.comment.created`, `linkedin.monitoring.comment.deleted`, `linkedin.monitoring.mention.created` |

Use the **exact** strings: the underscores in `publish_failed`, `reconnect_needed`,
`permanently_deleted` and `inline_comment` matter. See [overview.md](overview.md).

## Rotating the Secret

Ordinal's docs say that during a secret rotation `webhook-signature` can carry two
signatures, and a request is valid when either matches. They don't say how to start a
rotation or how long the old secret keeps signing. Update `ORDINAL_WEBHOOK_SECRET` as
soon as you have the new secret.

## Testing

**Ordinal documents no test or `ping` event.** To exercise your handler:

- Perform the real action in the app (create a post, request an approval, add a comment).
- Run the example's test suite, which signs Ordinal's documented payloads with a test
  secret.
- Replay a saved delivery from your gateway. A delivery replayed more than five minutes
  after it was signed fails the library's timestamp check; see
  [verification.md](verification.md) for a verifier with your own window.

## Local Development

```bash
npx hookdeck-cli listen 3000 ordinal --path /webhooks/ordinal
```

Use `8000` for the FastAPI example. No account required: the CLI gives you a public HTTPS
URL to paste into the webhook's `url`, plus a web UI for inspecting and replaying requests.
Your handler verifies the signature with the webhook's own secret.

## Optional Custom Headers

The `headers` field adds static headers to every delivery. They're separate from the
signature and cover nothing in the body, but you can use one as an extra check (for
example, an API key header that a gateway checks before your handler). Send the complete
`headers` object on `PATCH /webhooks/{id}`, then confirm with `GET /webhooks/{id}`: the
docs don't say whether a `PATCH` merges into or replaces it, or whether the dashboard form
can set headers.
