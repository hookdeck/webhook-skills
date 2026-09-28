# Setting Up CircleCI Webhooks

## Prerequisites

- A CircleCI account with **organization admin** access — webhook management is
  admin-only.
- A project already building on CircleCI.
- An **HTTPS** endpoint (CircleCI requires `https://` for the webhook URL).

## Where Webhooks Live

CircleCI outbound webhooks are configured **per project**, not per organization.
Each project is limited to **5 outbound webhooks**.

## Add a Webhook in the CircleCI App

1. In the [CircleCI web app](https://app.circleci.com), select your organization.
2. Select **Projects** in the sidebar, find your project, select the ellipsis
   (**…**), and choose **Project Settings**.
3. Choose **Webhooks** in the sidebar.
4. Click **Add Webhook**.
5. Fill the form:

   | Field | What to enter |
   |---|---|
   | **Webhook name** | Anything descriptive — it appears in the payload as `webhook.name` |
   | **URL** | Your HTTPS endpoint, e.g. `https://your-app.example.com/webhooks/circleci` |
   | **Secret token** | The HMAC signing secret. **Optional in the form** — set it anyway, see below |
   | **Certificate Validation** | Leave enabled (API field `verify-tls`). CircleCI: "Only leave this unchecked for testing purposes" |
   | **Events** | Tick `workflow-completed` and/or `job-completed`. At least one is required |

6. Optionally hit **Test Ping Event** (see below).
7. **Save Webhook**.

## Get Your Signing Secret

**You choose it.** Unlike most providers, CircleCI doesn't generate the secret —
you type a value into the **Secret token** field, and that exact string is the
HMAC key. Generate something long and random:

```bash
openssl rand -hex 32
```

Put the same value in both places:

```bash
# .env
CIRCLECI_WEBHOOK_SECRET=<the value you typed into the Secret token field>
```

It is used as **UTF-8 bytes directly** — no prefix to strip, no base64 decoding.

> **This is not your CircleCI API token.** `Circle-Token` authenticates *you
> calling CircleCI*. The Secret token verifies *CircleCI calling you*. Never
> reuse one as the other.

### The secret is optional — treat that as a hazard

The web form marks **Secret token** as optional (`Secret token: N`), and the
docs' header table says `circleci-signature` is sent **"When present"**. A
webhook saved with no secret therefore delivers **unsigned** requests that no
handler can authenticate.

The v2 API is stricter — it marks `signing-secret` as **required** on
`POST /api/v2/webhook`.

Always set a secret, and make your handler **fail closed**: reject a request with
no `circleci-signature`, and return 500 (not 200) if `CIRCLECI_WEBHOOK_SECRET`
isn't configured. The examples in this skill do both.

## Create a Webhook via the v2 API

```bash
curl -X POST https://circleci.com/api/v2/webhook \
  -H "Circle-Token: $CIRCLECI_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production handler",
    "events": ["workflow-completed", "job-completed"],
    "url": "https://your-app.example.com/webhooks/circleci",
    "verify-tls": true,
    "signing-secret": "'"$CIRCLECI_WEBHOOK_SECRET"'",
    "scope": { "id": "<project-id>", "type": "project" }
  }'
```

| Body field | Notes |
|---|---|
| `name` | Free text; surfaces as `webhook.name` in payloads |
| `events` | Array from the enum `["workflow-completed", "job-completed"]`. At least one |
| `url` | **HTTPS only** |
| `verify-tls` | Boolean. Keep `true` |
| `signing-secret` | The HMAC key. **Required by the API** even though the UI treats it as optional |
| `scope` | `{ "id": "<project-id>", "type": "project" }` |

Get the project id from `GET /api/v2/project/{project-slug}` (slug looks like
`github/acme/my-repo` or `circleci/<org-id>/<project-id>`).

Related endpoints: `GET /api/v2/webhook?scope-id=<id>&scope-type=project` to
list, `PUT /api/v2/webhook/{id}` to update, `DELETE /api/v2/webhook/{id}` to
remove.

## Test Ping Event

The webhook form has a **Test Ping Event** button. It sends a **normal, fully
signed POST** — there is no special unsigned handshake and no challenge/echo
request anywhere in CircleCI's webhook flow. Your signature verification must
already work for the ping to succeed; that's the point of it.

The docs say only that *"The test ping event has an abbreviated payload for ease
of testing"* and never publish its `type`. A community implementation observed
`circleci-event-type: ping` with a body of just `type`, `id`, `happened_at`, and
`webhook` — no `project`, `organization`, `workflow`, or `pipeline`. Treat that
as **community-observed, not documented**: handle `ping` by returning 200 and
don't read fields beyond `id` and `type`.

## Testing Locally

CircleCI needs a public HTTPS URL, so a tunnel is required for local development:

```bash
# Express / Next.js (port 3000)
npx hookdeck-cli listen 3000 circleci --path /webhooks/circleci

# FastAPI (port 8000)
npx hookdeck-cli listen 8000 circleci --path /webhooks/circleci
```

No account required — the CLI creates a guest account on first run and gives you
a public HTTPS URL plus a web UI for inspecting and replaying requests. Paste the
printed URL into the webhook's **URL** field, set the **Secret token** to your
local `CIRCLECI_WEBHOOK_SECRET`, save, and click **Test Ping Event**.

### Sign a request by hand

Use `printf`, not `echo` — a trailing newline changes the digest:

```bash
SECRET='your_webhook_secret_token'
BODY='{"id":"3888f21b-eaa7-38e3-8f3d-75a63bba8895","type":"workflow-completed","happened_at":"2021-09-01T22:49:34.317Z","webhook":{"id":"cf8c4fdd","name":"Sample"},"workflow":{"id":"fda08377","name":"build","status":"success","url":"https://app.circleci.com/"},"project":{"slug":"github/acme/app"},"pipeline":{"number":130,"vcs":{"branch":"main","revision":"1dc6aa6"}}}'

SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -r | cut -d' ' -f1)

curl -X POST http://localhost:3000/webhooks/circleci \
  -H "Content-Type: application/json" \
  -H "circleci-event-type: workflow-completed" \
  -H "circleci-signature: v1=$SIG" \
  -d "$BODY"
```

### Known-answer check

If your verification is misbehaving, test it against CircleCI's own documented
vectors before blaming the wire:

| Body | Secret | `v1` signature |
|---|---|---|
| `hello world` | `secret` | `734cc62f32841568f45715aeb9f4d7891324e6d948e4c6c60c0621cdac48623a` |
| `lalala` | `another-secret` | `daa220016c8f29a8b214fbfc3671aeec2145cfb1e6790184ffb38b6d0425fa00` |
| `an-important-request-payload` | `hunter123` | `9be2242094a9a8c00c64306f382a7f9d691de910b4a266f67bd314ef18ac49fa` |
| `foo` | `secret` | `773ba44693c7553d6ee20f61ea5d2757a9a4f4a44d2841ae4e95b52e4cd62db4` |

## Test Mode vs Live Mode

CircleCI has **no webhook sandbox or test mode**. Every delivery is a real
delivery from a real workflow or job. To generate traffic on demand:

- **Test Ping Event** — a real signed POST with an abbreviated payload.
- **Re-run a workflow** in the CircleCI app — produces genuine
  `workflow-completed` and `job-completed` payloads.
- A **throwaway project** with a trivial `.circleci/config.yml` is the cheapest
  way to exercise both success and failure statuses.

## Rotating the Secret

CircleCI's docs describe **one** Secret token per webhook and don't document a
rotation overlap window or multi-secret signing, so plan as if the change is
immediate. Zero-downtime rotation then means accepting either secret in your
handler for the changeover:

1. Deploy a handler that accepts `CIRCLECI_WEBHOOK_SECRET` **or**
   `CIRCLECI_WEBHOOK_SECRET_PREVIOUS`.
2. Change the Secret token in Project Settings, and set the new value as
   `CIRCLECI_WEBHOOK_SECRET`.
3. Once traffic is clean, remove the previous secret.

## Troubleshooting Setup

| Symptom | Likely cause |
|---|---|
| No `circleci-signature` header arrives | No Secret token configured on the webhook (it's optional in the UI) |
| Can't add, edit or delete webhooks | Not an org admin (required for all three) |
| Can't add another webhook | The project already has its **5-webhook** limit |
| URL rejected | CircleCI requires **HTTPS** |
| TLS errors on delivery | Cert not trusted; fix the cert rather than disabling `verify-tls` |
| Nothing arrives after a build | Wrong event ticked — only `workflow-completed` and `job-completed` exist, and both fire at *terminal* state only |

## Official Documentation

- [Outbound webhooks guide](https://circleci.com/docs/guides/integration/outbound-webhooks/)
- [Validate webhooks](https://circleci.com/docs/guides/integration/outbound-webhooks/#validate-webhooks)
- [Outbound webhooks reference](https://circleci.com/docs/reference/outbound-webhooks-reference/)
