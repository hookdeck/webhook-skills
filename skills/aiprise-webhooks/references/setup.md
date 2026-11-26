# Setting Up AiPrise Webhooks

## Prerequisites

- An AiPrise account with access to the Dashboard
- Your AiPrise **API private key** (this is also your webhook signing key)
- Your application's callback endpoint URL (publicly reachable, HTTPS)

## Get Your Signing Key

AiPrise webhooks are **not** signed with a separate webhook/endpoint secret. The
HMAC key is your **AiPrise API private key** directly (for example
`abcdef12-pqrs-abcd-pqrs-abcde0123456`).

1. Go to the AiPrise Dashboard.
2. Open your API settings and copy the API private key.
3. Store it as `AIPRISE_API_KEY` in your environment — your handler uses the same
   value both to call the AiPrise API and to verify callback signatures.

> Keep the API private key secret. Anyone with it can forge valid callback signatures.

## Configure Callback URLs

Callback URLs can be set at the template level or overridden per request.

### Template level (applies to every session using the template)

1. Go to Dashboard → **View Templates** → select your template `{TemplateID}`.
2. Set:
   - **Callback URL** — receives decision callbacks (final results).
   - **Events Callback URL** — receives event callbacks for each step of a case.
3. Save the template.

### Per request (overrides the template for a single session)

When creating a verification session via the API, pass:

- `callback_url` — decision callback destination.
- `events_callback_url` — event callback destination.

Request-level URLs take precedence over the template configuration.

## Recommended Endpoint Path

Match your handler route to the examples in this skill:

```
POST /webhooks/aiprise
```

## Correlate Sessions with Your Records

Pass `client_reference_id` when starting a verification session (e.g. your user ID
or order ID). AiPrise echoes it back in the callback alongside
`verification_session_id`, so you can match the outcome to the right record.

## Test Mode vs Live Mode

Sandbox and Production have separate API keys, so each environment signs callbacks
with its own key, and webhooks are configured per environment. Use the Sandbox
environment and templates to trigger sample verification
outcomes before going live. Run a test verification and confirm your endpoint:

1. Receives a POST at `/webhooks/aiprise`.
2. Passes `X-HMAC-SIGNATURE` verification (see [verification.md](verification.md)).
3. Dispatches event callbacks on their event field, and decision callbacks on
   `aiprise_summary`.

## Local Development

Use the Hookdeck CLI to receive callbacks on your machine — no account required:

```bash
npx hookdeck-cli listen 3000 aiprise --path /webhooks/aiprise
```

Set the Hookdeck-provided URL as your template's callback URL (or per-request
`callback_url`) while developing.
