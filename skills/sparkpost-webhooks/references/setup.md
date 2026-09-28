# Setting Up SparkPost Webhooks

## Prerequisites

- A SparkPost account (US: `app.sparkpost.com`; EU: `app.eu.sparkpost.com`)
- An API key with the `webhooks/modify` grant (plus `webhooks/view` to read them back) — only if using the API
- A publicly reachable endpoint **on port 80 or 443** — *"Webhooks only support standard ports,
  port 80 for HTTP traffic and port 443 for HTTPS traffic. You will not be able to create a
  webhook using a non-standard port."*
- Credentials you will require on that endpoint (see "Choose an authentication mode" below)

There is **no signing secret to fetch** — SparkPost event webhooks are not signed. Don't go
looking for one in the dashboard.

## Before You Create the Webhook: Your Endpoint Must Already Return 200

*"When a webhook is created, a test POST request is sent to the target URL. If this request
does not receive an HTTP 200 response, your request to the Webhook API will fail with HTTP 400
and the webhook will not be created."* The same test fires whenever you change the target URL.

So the order of operations is:

1. Deploy your handler (or start a tunnel — see "Local development" below).
2. Make sure it returns **200** for a batch it doesn't understand, including `[{"msys":{}}]`.
3. Configure the credentials on the endpoint **first**, so the test POST is accepted.
4. Then create the webhook.

Whether the creation-time test POST carries the Basic Auth header is **not explicitly
documented**. It is expected to, since authentication is part of the webhook configuration
being tested — but don't rely on it either way: if creation fails with HTTP 400 while your
endpoint is otherwise healthy, log the headers of the test POST your endpoint received to see
whether credentials arrived, and use `POST /api/v1/webhooks/{id}/validate` (which echoes your
endpoint's status and body) once the webhook exists. Don't switch enforcement off to get past it.

## Choose an Authentication Mode

`auth_type` is an enum with exactly these values, defaulting to `none`:

| `auth_type` | Configure with | SparkPost sends | Recommendation |
|-------------|----------------|-----------------|----------------|
| `none` | — | nothing | Never use in production |
| `basic` | `auth_credentials: { username, password }` | `Authorization: Basic base64(user:pass)` | **Use this** |
| `oauth2` | `auth_request_details: { url, body }` | `Authorization: Bearer {token}` | Use if you already run an authorization server |

Plus a deprecated field: `auth_token` — *"Deprecated in favor of the auth_type field.
Authentication token to present in the `X-MessageSystems-Webhook-Token` header of POST requests
to target."* The support doc says *"The Header-Based Token method has been deprecated and is not
available for new webhooks"*; existing webhooks keep working.

## Create the Webhook in the App (UI)

1. Sign in at `app.sparkpost.com` (or `app.eu.sparkpost.com` for the EU region).
2. Open the Webhooks page (`app.sparkpost.com/webhooks`, or `app.eu.sparkpost.com/webhooks`) and create a new webhook. (Exact menu labels vary between app versions.)
3. **Webhook Name** — anything meaningful, e.g. `Production event stream`.
4. **Target URL** — your HTTPS endpoint, e.g. `https://example.com/webhooks/sparkpost`.
   Only ports 80 (http) and 443 (https) are accepted; a target on any other port is rejected
   when the webhook is created.
5. **Event Source** — the subaccount(s) whose events you want (Primary and All Subaccounts, or
   a specific subaccount). Optionally exclude subaccounts via `exception_subaccounts`.
6. **Authentication** — the dropdown defaults to **None**. Per the support doc: *"The
   authentication method is set to 'None' by default when creating a new webhook. To configure
   either Basic Auth or OAuth 2.0, select the appropriate value from the 'Authentication'
   drop-down list."* Choose:
   - **Basic Auth** → enter the **username** and **password your endpoint expects**. The docs
     stress these are *"not your SparkPost username and password"*.
   - **OAuth 2.0** → enter the **Client ID**, **Client Secret**, and **Token URL** of your
     authorization server.
7. **Events** — tick the event types you want. Start narrow (`delivery`, `bounce`,
   `spam_complaint`, `click`, `open`) and widen later; every extra type is extra volume.
8. Optionally add **custom headers** (e.g. `x-api-key: abcd`) as a supplementary check.
9. Save. The test POST fires now — if your endpoint doesn't return 200, creation fails.

Events start arriving **about 1 minute** after successful creation.

## Create the Webhook via the API

Basic Auth (the recommended mode):

```bash
curl -X POST https://api.sparkpost.com/api/v1/webhooks \
  -H "Authorization: $SPARKPOST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production event stream",
    "target": "https://example.com/webhooks/sparkpost",
    "auth_type": "basic",
    "auth_credentials": {
      "username": "basicauthuser",
      "password": "a-long-random-string"
    },
    "custom_headers": { "x-api-key": "abcd" },
    "events": ["delivery", "bounce", "spam_complaint", "click", "open"]
  }'
```

`username` is **required**; `password` is **not required** by the API reference and may be
empty. If you send an empty password, SparkPost still sends a well-formed header —
`base64("basicauthuser:")` — so your comparison must treat an empty password as legitimate
rather than as "missing".

OAuth 2.0 client credentials:

```bash
curl -X POST https://api.sparkpost.com/api/v1/webhooks \
  -H "Authorization: $SPARKPOST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production event stream (oauth2)",
    "target": "https://example.com/webhooks/sparkpost",
    "auth_type": "oauth2",
    "auth_request_details": {
      "url": "https://example.com/oauth/token",
      "body": {
        "client_id": "CLIENT123",
        "client_secret": "9sdfj791d2bsbf",
        "grant_type": "client_credentials"
      }
    },
    "events": ["delivery", "bounce", "click", "open"]
  }'
```

Per the API reference, `auth_request_details.url` is *"The URL for the authorization server"*
and `body` is *"The body to send in the request to the authorization server. This likely should
contain the client ID, client secret, and grant type."*

Use `https://api.eu.sparkpost.com/api/v1/webhooks` for EU-region accounts.

## Verify the Endpoint Any Time

```bash
curl -X POST https://api.sparkpost.com/api/v1/webhooks/{id}/validate \
  -H "Authorization: $SPARKPOST_API_KEY"
```

This *"sends an example message event batch [to] the target URL, validates that the target
responds with HTTP 200, and returns information on the response received from the target"*. The
sample batch is literally `[{"msys":{}}]`, so your handler must return 200 for a batch with an
empty `msys` object. A successful response looks like:

```json
{
  "results": {
    "msg": "Test POST to endpoint succeeded",
    "response": { "status": 200, "headers": { "Content-Type": "text/plain" }, "body": "OK" }
  }
}
```

The response echoes your endpoint's actual status, headers, and body — the fastest way to debug
a 401 from your own auth check.

## Discover Available Event Types

```bash
curl https://api.sparkpost.com/api/v1/webhooks/events/documentation
```

Returns every wrapper key, event type, and field (with descriptions and sample values). Use it
instead of hardcoding a list from memory, and to generate test fixtures.

## Inspect Failed Batches

```bash
curl https://api.sparkpost.com/api/v1/webhooks/{id}/batch-status \
  -H "Authorization: $SPARKPOST_API_KEY"
```

Batch status is kept for **24 hours** and *"does not report batches that succeeded first time.
It reports only failed batches and batches that initially failed but later succeeded."*

## Rotating Credentials

Update the webhook in place with `PUT /api/v1/webhooks/{id}`, sending the new
`auth_credentials`. To avoid a gap, have your endpoint accept both the old and new credentials
during the change window, then drop the old pair. Note that changing the **target URL** (but
not the credentials) triggers a fresh test POST that must return 200.

## Test Mode vs Live Mode

SparkPost has no separate webhook test mode. Options for exercising a handler safely:

- **`POST /api/v1/webhooks/{id}/validate`** — sends the `[{"msys":{}}]` sample batch to the real
  target; the cheapest smoke test.
- **A second webhook** pointed at a staging target with the same events. Webhooks are
  independent, so production keeps flowing.
- **A sandbox sending domain / subaccount**, combined with `exception_subaccounts` or an
  event-source scoped to that subaccount, so staging only sees staging traffic.
- **The Hookdeck CLI** to replay captured batches at a local handler (below).

## Local Development

SparkPost only posts to ports 80/443 and needs a public URL, so you need a tunnel:

```bash
npx hookdeck-cli listen 3000 sparkpost --path /webhooks/sparkpost
```

(Use `8000` for the FastAPI example.) The CLI prints a public HTTPS URL to use as the webhook
`target`, and gives you a web UI for inspecting and replaying each batch. No account required —
it creates a guest account on first run.

If you put **Hookdeck** in front of SparkPost permanently, note that Hookdeck's `SPARKPOST`
source supports **Basic Auth** only (no OAuth 2.0 token-URL flow): set `auth_type: "basic"` on
the SparkPost webhook and configure the same username and password on the Hookdeck source.

## Network Security Options

- **HTTPS** is recommended. Per the API reference, *"Only ports 80 for http and 443 for https can
  be set"*; a non-standard port is rejected at creation. (An older SparkPost SSL support article
  still shows a custom-port example such as `:81`; the API reference rule is the one that applies.)
- **mTLS** *"is in route to deprecation on all regions at May 18th, 2026"* — don't build on it.
- **IP allowlisting**: SparkPost maintains the hostname `wh.egress.sparkpost.com`, *"which
  lists the egress IPs under the host's A record"*. Non-Enterprise customers are told to
  allowlist **the hostname**, not individual IPs. Never hardcode an IP list.
- **`custom_headers`**: an object of extra headers sent on every batch POST (the docs' example
  is `{"x-api-key": "abcd"}`), suggested as an *additional* security measure. Documented limits: *"A maximum of 5 headers
  may be provided"*, keys must be strings or numbers (alphanumeric), and *"Total header size must
  be smaller than 3000 bytes"*.
  This is a supplement to, not a replacement for, Basic Auth or OAuth 2.0.
