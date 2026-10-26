# Setting Up TutorCruncher Webhooks

## Prerequisites

- A TutorCruncher account with access to System > Settings > Integrations
- A publicly reachable HTTPS endpoint (locally: `npx hookdeck-cli listen 3000 tutorcruncher --path /webhooks/tutorcruncher`)

## Get Your Signing Key

TutorCruncher has no separate webhook secret. Webhooks are signed with the integration's
**private API key**. Use your TutorCruncher integration's private API key and keep it server-side:

```bash
TUTORCRUNCHER_WEBHOOK_SECRET=your_private_api_key
```

## Register Your Endpoint

1. In TutorCruncher open **System > Settings > Integrations**.
2. Click **Add Integration** to open the Add Integration panel.
3. Enter your webhook URL, e.g. `https://example.com/webhooks/tutorcruncher`, and save.

Webhooks then fire for every action. There is no per-event subscription: filter on `action` in
your handler.

## Using Hookdeck

Create a Hookdeck source of type **TutorCruncher** and use its URL as the integration's webhook
URL. Hookdeck shows this note for the source:

"Paste your TutorCruncher private API key. TutorCruncher signs webhooks with it."

TutorCruncher's docs don't name the HTTP method. Hookdeck's TutorCruncher source pre-selects
POST without managing the method, so if the sender uses another method, allow that method on
the source too. The examples in this skill accept GET, POST, PUT, PATCH and DELETE.

## Webhook Logs

Click an integration's name to see its webhook logs: when each webhook fired, whether it
succeeded, and the request and response data (expand a log with its arrow).

## Retries and Disabling

Timeouts, no response and `5xx` are retried up to 4 times (after 1 s, 10 s, 100 s and 1000 s).
Redirects and `4xx` other than `429` are not retried. An endpoint whose failure rate stays above
20% is disabled, so don't return `4xx` for events you merely ignore.

## Test

```bash
SECRET=your_private_api_key
BODY='{"events":[{"action":"CREATED_A_CONTRACTOR","verb":"Created a Tutor","subject":{"model":"Tutor","id":1623}}]}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $NF}')
curl -X POST http://localhost:3000/webhooks/tutorcruncher \
  -H "Content-Type: application/json" -H "Webhook-Signature: $SIG" -d "$BODY"
```
