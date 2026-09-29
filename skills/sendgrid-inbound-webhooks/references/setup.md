# Setting Up SendGrid Inbound Parse Webhooks

## Prerequisites

- A SendGrid account with an **authenticated domain**. Only authenticated
  domains may be used when configuring Inbound Parse.
- DNS control over that domain, to add an MX record.
- A SendGrid API key with Mail Settings / webhook permissions (for the
  API-driven steps below).
- A publicly reachable HTTPS endpoint. For local development, use the Hookdeck
  CLI (see the bottom of this page).

## Step 1: Add the MX Record

Pick a dedicated receiving hostname — a subdomain, e.g. `parse.example.com`.
Do not reuse your main sending domain.

| Setting | Value |
|---------|-------|
| Host / Name | `parse` (or the full `parse.example.com.` with a trailing period, depending on your DNS provider) |
| Type | `MX` |
| Priority | `10` |
| Value / Points to | `mx.sendgrid.net` |
| TTL | Leave at the provider default |

Changing or removing this MX record later stops email delivery to that hostname.

**If the receiving hostname is on your authenticated domain**, turn *off*
Automatic Security on that authenticated domain. Leaving it on creates an
infinite message loop between the CNAME and MX records.

Three local-parts are reserved and cannot be used: `abuse@`, `postmaster@` and
`unsubscribe@`. Any other single word or combination of words works, and the
address does not need to exist anywhere — everything sent to the hostname is
parsed.

## Step 2: Create the Parse Setting

**UI:** SendGrid Dashboard → Settings → Inbound Parse → *Add Host & URL*.
Choose the receiving domain, enter your destination URL, and optionally tick
*Check incoming emails for spam* and *POST the raw, full MIME message*.

**API:** `POST https://api.sendgrid.com/v3/user/webhooks/parse/settings`

```bash
curl -X POST "https://api.sendgrid.com/v3/user/webhooks/parse/settings" \
  --header "Authorization: bearer $SENDGRID_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "url": "https://example.com/webhooks/sendgrid-inbound",
    "hostname": "parse.example.com",
    "spam_check": false,
    "send_raw": false
  }'
```

| Field | Effect |
|-------|--------|
| `url` | Where the `multipart/form-data` POST is sent |
| `hostname` | The MX-pointed receiving hostname |
| `spam_check` | `true` adds `spam_score` and `spam_report` form fields. Only analyses messages up to 2.5 MB |
| `send_raw` | `false` (default) → parsed form fields. `true` → a single `email` field with the whole MIME message. See [overview.md](overview.md) |

## Step 3: Define a Webhook Security Policy (optional but recommended)

**This is the key difference from the SendGrid Event Webhook.** The Event
Webhook has a UI toggle in Settings → Mail Settings. Inbound Parse signing is
configured **over the API only**, as a reusable *security policy* object.

Until you attach a policy, your Parse webhook is **unsigned** — no
`X-Twilio-Email-Event-Webhook-Signature` header arrives at all.

`POST https://api.sendgrid.com/v3/user/webhooks/security/policies`

```bash
curl -X POST "https://api.sendgrid.com/v3/user/webhooks/security/policies" \
  --header "Authorization: bearer $SENDGRID_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "name": "example policy",
    "oauth": {
      "client_id": "client_456",
      "client_secret": "secret",
      "token_url": "http://oauth.example.com/user/456/token",
      "scopes": ["webhooks:read", "webhooks:write"]
    },
    "signature": { "enabled": true }
  }'
```

You may omit either `signature` or `oauth`, but **one of the two is required**
for a valid policy. Including both is the "hybrid" approach.

Response:

```json
{
  "policy": {
    "id": "dd677638-a16d-4e19-95ea-20231c35511b",
    "name": "example policy",
    "oauth": {
      "client_id": "client_456",
      "token_url": "http://oauth.example.com/user/456/token",
      "scopes": ["webhooks:read", "webhooks:write"]
    },
    "signature": {
      "public_key": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEmgmjvPAR/Lmwn2teL2WJUDIx35PqsnLKjPhPbrKkfMg6vK4NZQB1VeFSKbV7whQbEJRFHjF8+1zJxsXRP1GbWw=="
    }
  }
}
```

### Store `policy.signature.public_key`

Save it as `SENDGRID_INBOUND_PUBLIC_KEY`. Two things to know about that value:

1. It is **base64 DER SubjectPublicKeyInfo**, not PEM. There are no
   `-----BEGIN PUBLIC KEY-----` lines. Code that assumes PEM throws on it.
   See [verification.md](verification.md).
2. SendGrid's docs are explicit: *"You don't need to request the public key for
   each incoming webhook. Doing so may introduce unnecessary latency and
   dependencies."* Load it once at startup from your secret store.

Note the policy `id` too — you need it for the next step.

## Step 4: Attach the Policy to the Parse Setting

`PATCH https://api.sendgrid.com/v3/user/webhooks/parse/settings/{hostname}`

```bash
curl -X PATCH "https://api.sendgrid.com/v3/user/webhooks/parse/settings/parse.example.com" \
  --header "Authorization: bearer $SENDGRID_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "url": "https://example.com/webhooks/sendgrid-inbound",
    "spam_check": false,
    "send_raw": false,
    "security_policy": "dd677638-a16d-4e19-95ea-20231c35511b"
  }'
```

The response echoes the updated Parse Setting including `security_policy`.
From this point, every POST to your endpoint carries:

- **Signature policy:** `X-Twilio-Email-Event-Webhook-Signature` and
  `X-Twilio-Email-Event-Webhook-Timestamp`
- **OAuth policy:** `Authorization: Bearer <OAUTH_ACCESS_TOKEN>`
- **Hybrid:** all three

Creating the policy alone changes nothing. It is inert until this PATCH
attaches it to a specific hostname.

## Step 5: Test

Send an email to any address at the hostname:

```bash
echo "test body" | mail -s "test subject" anything@parse.example.com
```

Watch for the POST. Attach a file to exercise the multipart-with-binary path —
that is where raw-body handling breaks, and a text-only test will not catch it.

Flip `send_raw` and re-send to confirm your handler tolerates both formats.

## Local Development

```bash
npx hookdeck-cli listen 3000 sendgrid-inbound --path /webhooks/sendgrid-inbound
```

(Use `8000` for FastAPI.) Point the Parse Setting `url` at the URL the CLI
prints. No account required — the CLI creates a guest account on first run and
gives you a web UI for inspecting and replaying requests.

Replay is particularly useful here: an inbound email is not repeatable, so
being able to re-deliver a captured multipart body byte-for-byte is the only
practical way to iterate on attachment handling.

## Troubleshooting Setup

| Symptom | Cause |
|---------|-------|
| No POST ever arrives | MX record missing, wrong priority, or not yet propagated (`dig MX parse.example.com`) |
| Mail loops / bounces | Automatic Security still on for the authenticated domain |
| `abuse@` / `postmaster@` / `unsubscribe@` mail vanishes | Reserved local-parts, cannot be parsed |
| No signature header | No security policy attached, or the policy has no `signature` block |
| `spam_score` missing | `spam_check` is `false`, or the message exceeds 2.5 MB |
| Body arrives as one `email` field | `send_raw` is `true` |
