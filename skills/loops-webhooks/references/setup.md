# Loops Webhooks Setup

## Prerequisites

- A Loops account.
- A public HTTPS endpoint. For local development, use `npx hookdeck-cli listen 3000 loops --path /webhooks/loops`.

## 1. Set the Endpoint

1. Go to [Settings -> Webhooks](https://app.loops.so/settings?page=webhooks).
2. Enter the URL of your endpoint, e.g. `https://example.com/webhooks/loops`.
3. Subscribe to events with the toggles. Click a group name to see every event in it.

Loops allows **one webhook endpoint per account**. To send events to several systems, receive them in one place and fan out (an event gateway such as Hookdeck can route one source to many destinations).

Toggling the endpoint on can take a few seconds before requests start.

## 2. Save the Signing Secret

The settings page shows a signing secret when you set the endpoint. Store it in an environment variable:

```bash
LOOPS_WEBHOOK_SECRET=whsec_xxxxx
```

Paste it as shown. The handlers strip an optional `whsec_` prefix and base64-decode the rest, as Loops' own example does. (Loops' example reads it from `LOOPS_SIGNING_SECRET`; any name works.)

**Hookdeck:** the Loops source type (`LOOPS`) verifies with the same secret, pasted with or without `whsec_`.

## 3. Rolling the Secret

When you roll the secret in the settings page, the previous secret stays valid for **24 hours**. During that window Loops puts a signature for each secret in `Webhook-Signature`, so a handler that checks every `v1` entry keeps passing with either secret. Deploy the new secret (and update a Hookdeck source) before the 24 hours are up.

## 4. Send a Test Request

The Webhooks settings page can send a test request to your endpoint at any time. It sends `testing.testEvent`:

```json
{ "eventName": "testing.testEvent", "eventTime": 1734425918, "message": "test", "webhookSchemaVersion": "1.0.0" }
```

It's signed like every other event, so it checks both reachability and your verification code.

With the Hookdeck CLI:

```bash
npx hookdeck-cli listen 3000 loops --path /webhooks/loops
```

Paste the printed URL as the endpoint, click the test button, and inspect the request in the CLI's web UI.

## 5. History and Failures

- The **Messages** section at the bottom of the Webhooks settings page lists successful, failed, pending and retrying events for the last 30 days. Click one to see your endpoint's response.
- Failed deliveries are retried up to eight times over about 28 hours.
- If every attempt fails for 5 days the endpoint is disabled. Turn it back on from Settings -> Webhooks once it responds with `2xx`.
