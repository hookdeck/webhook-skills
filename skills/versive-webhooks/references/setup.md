# Setting Up Versive Webhooks

## Prerequisites

- A Versive organization ([getversive.com](https://getversive.com/))
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Register a Versive Webhook Endpoint?

Webhooks are an organization-level integration provisioned by the Versive team. There is no
self-serve dashboard page, and creating or rotating destinations is not part of the public `v1`
REST API.

1. Email [support@getversive.com](mailto:support@getversive.com) and ask them to configure a
   webhook for your organization, giving the HTTPS URL, e.g. `https://example.com/webhooks/versive`.
2. Versive creates one organization-level destination that reports completed interviews
   (`interview.completed`).
3. Get the endpoint's signing secret from them (see below).
4. Return a `2xx` once your service has accepted the event. Anything else is retried.

## Where Do I Find the Signing Secret?

Hookdeck's configuration alert for the Versive source reads:

> Versive support sets up webhooks. Ask them for the endpoint's signing secret.

Versive's docs call it "your endpoint secret" but don't print its format. Deliveries are signed
by Svix, whose secrets look like `whsec_<base64>`, so expect a value starting with `whsec_`.
Store the full value, prefix included:

```bash
VERSIVE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

If the value doesn't start with `whsec_`, the examples reject it with a 500 instead of verifying
with the wrong key.

## How Do I Test It?

There is no documented test-event action, so use the Hookdeck CLI tunnel and complete a real
interview in a study (or ask Versive support to send a test delivery):

```bash
npx hookdeck-cli listen 3000 versive --path /webhooks/versive
```

Point the Versive destination at the tunnel URL they give you for local work, and put the
signing secret in `.env`.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| Every delivery fails verification | The handler verifies a re-serialized body instead of the raw bytes, or the secret belongs to a different endpoint |
| No deliveries arrive | The destination hasn't been provisioned yet, or points at the wrong URL: check with Versive support |
| No delivery for an interview | Screened-out interviews don't trigger `interview.completed` |
| "Timestamp too old" on retries or replays | The SDK's fixed 5-minute window; use the manual verifier in [verification.md](verification.md) |
