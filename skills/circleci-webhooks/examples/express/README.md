# CircleCI Webhooks - Express Example

Minimal example of receiving **CircleCI outbound webhooks** in Express, with
signature verification, deduplication, and both payload shapes handled.

> **Not [Circle](https://circle.com).** Circle (circle.com) is the USDC / Circle
> Mint payments company; it signs with **ECDSA** and an `X-Circle-Signature`
> header. CircleCI signs with **HMAC-SHA256** and a `circleci-signature` header.
> Unrelated companies.

> **Not CircleCI *custom* webhooks**, which go the other way — a third party
> POSTs to CircleCI to trigger a pipeline. This example receives CircleCI's
> outbound notifications.

## The Scheme

| | |
|---|---|
| Header | `circleci-signature` |
| Format | Comma-separated `<version>=<signature>` pairs, e.g. `v1=<hex>` |
| Version | **`v1` only** — no `v1` entry means reject, never fall back |
| Algorithm | HMAC-SHA256, **lowercase hex** (64 chars) |
| Signed content | **The raw request body bytes alone** — no timestamp, no id, no prefix |
| Key | The webhook's **Secret token**, used as UTF-8 bytes directly |
| Replay window | **None exists** — dedupe on the payload `id` instead |

## Prerequisites

- Node.js 18+
- A CircleCI project with a webhook configured, and its Secret token
  (**org admin** access is required to manage webhooks)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your webhook's **Secret token** to `.env`:
   ```bash
   CIRCLECI_WEBHOOK_SECRET=your_webhook_secret_token
   ```

   You choose this value — CircleCI does not generate it. Type the same string
   into **Project Settings → Webhooks → Secret token** and into `.env`. Generate
   one with `openssl rand -hex 32`.

   This is **not** your CircleCI API token (`Circle-Token`). That authenticates
   you calling CircleCI; this verifies CircleCI calling you.

## Run

```bash
npm start
```

Server runs on `http://localhost:3000`.

Webhook endpoint: `POST http://localhost:3000/webhooks/circleci`

## Test

```bash
npm test
```

Covers CircleCI's four documented known-answer vectors, valid and tampered
signatures, wrong secrets, missing headers, the `v1=<valid>,v2=garbage` case, the
`v2`-only downgrade attack, hex-vs-base64, the "no timestamp is signed" trap, the
`timingSafeEqual` length guard, non-ASCII bodies, re-serialized bodies,
deduplication on the payload `id`, both `pipeline.vcs` and
`pipeline.trigger_parameters` shapes, and the community-observed ping payload.

### Receive real webhooks locally

CircleCI requires an **HTTPS** receiver URL, so you need a tunnel:

```bash
npx hookdeck-cli listen 3000 circleci --path /webhooks/circleci
```

No account, no install required — the CLI creates a guest account on first run
and gives you a public HTTPS URL plus a web UI for inspecting requests. Paste the
printed URL into **Project Settings → Webhooks → URL**, set the same
Secret token, save, then hit **Test Ping Event**.

That button sends a **normal, fully-signed POST** — there is no unsigned
handshake or challenge request anywhere in CircleCI's webhook flow. Your
verification has to already work for it to pass, which is the point of it.

### Sign a request by hand

Note `printf`, not `echo` — a trailing newline changes the digest:

```bash
SECRET='your_webhook_secret_token'
BODY='{"id":"3888f21b-eaa7-38e3-8f3d-75a63bba8895","type":"workflow-completed","happened_at":"2021-09-01T22:49:34.317Z","webhook":{"id":"cf8c4fdd","name":"Sample"},"project":{"slug":"github/acme/app"},"workflow":{"name":"build","status":"success","url":"https://app.circleci.com/"},"pipeline":{"number":130,"vcs":{"branch":"main","revision":"1dc6aa6"}}}'

SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -r | cut -d' ' -f1)

curl -X POST http://localhost:3000/webhooks/circleci \
  -H "Content-Type: application/json" \
  -H "circleci-event-type: workflow-completed" \
  -H "circleci-signature: v1=$SIG" \
  -d "$BODY"
```

Sanity-check your `openssl` invocation against a documented vector first:

```bash
printf '%s' 'hello world' | openssl dgst -sha256 -hmac 'secret' -r | cut -d' ' -f1
# 734cc62f32841568f45715aeb9f4d7891324e6d948e4c6c60c0621cdac48623a
```

## How It Works

1. **`express.raw({ type: 'application/json' })`** gives the handler the exact
   bytes CircleCI sent. Never mount `express.json()` ahead of this route — a
   parsed or re-serialized body breaks the digest.
2. **Verify** with `verifyCircleCISignature` before anything is parsed.
3. **Parse** — only after verification passes.
4. **Dedupe** on the payload's top-level `id`. CircleCI sends no delivery-id
   header, and warns that "webhook requests may be duplicated".
5. **Respond 200 immediately**, then process in `setImmediate`. CircleCI's
   timeout is **10 seconds**.

## Security

- HMAC-SHA256, **lowercase hex** digest (not base64), over the **raw body bytes
  alone**
- The Secret token is used as **UTF-8 bytes directly** — no prefix to strip, no
  base64 decoding
- Constant-time comparison with a **length guard first**, because
  `crypto.timingSafeEqual` throws on mismatched lengths and an uncaught throw
  becomes a 500 that CircleCI retries
- **Only `v1` is checked.** CircleCI: *"Only check the latest signature type to
  prevent downgrade attacks."* Unknown versions are ignored; a missing `v1` entry
  is a rejection, never a fallback
- **Fails closed**: an unconfigured secret returns `500` (so CircleCI retries
  once it's fixed), and a missing `circleci-signature` header returns `400`.
  CircleCI's Secret token is optional in its UI, so unsigned deliveries are a
  real possibility — they are never trusted here
- **No replay window**, because CircleCI signs no timestamp and documents no
  tolerance. `happened_at` is event time, not a signing input — rejecting on it
  would silently drop legitimate retries
- **No source-IP allowlist is documented** by CircleCI — the HMAC is the
  credential

## Payload Shapes

`pipeline.vcs` is **not always present**:

| Integration | Where branch/commit live |
|---|---|
| GitHub OAuth, Bitbucket Cloud | `pipeline.vcs` (`branch`, `revision`, `commit.subject`, …) |
| GitLab, GitHub App | `pipeline.trigger_parameters.git` — **no `vcs` at all** |

`extractVcsInfo()` normalises both. A handler doing `pipeline.vcs.branch`
directly will throw on GitLab and GitHub App pipelines.

Payloads are **"open maps"** — CircleCI may add fields without notice. Parse
leniently.

## Events Handled

Exactly two exist:

| Event | `status` values |
|---|---|
| `workflow-completed` | `success`, `failed`, `error`, `canceled`, `unauthorized` |
| `job-completed` | `success`, `failed`, `canceled`, `unauthorized` (**no `error`**) |

In a `job-completed` payload, the `workflow` object has **no `status`**.

The handler also acknowledges `ping` (the UI's **Test Ping Event**). That type
value is **community-observed, not documented** — it's handled gracefully but
nothing is built on its fields.
