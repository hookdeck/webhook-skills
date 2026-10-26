# Setting Up HackerOne Webhooks

## Prerequisites

- A HackerOne program where you can manage webhooks (they are bound to the permissions of the user who creates them)
- A public HTTPS endpoint for your receiver (use the Hookdeck CLI locally)

## Set a Secret and Create the Webhook

HackerOne's API docs describe the webhook behaviour but not the dashboard screens, so look for the webhooks section in your program's settings. When you create the webhook:

1. Enter your endpoint URL, for example `https://example.com/webhooks/hackerone`.
2. Choose the events to subscribe to (for example `report_created`, `report_triaged`, `report_bounty_awarded`). Subscribing only to events you handle limits the number of requests.
3. Set a secret.

Set a secret on the HackerOne webhook and paste it here. Without one, HackerOne signs with an empty key, which this source cannot verify.

Store the secret as `HACKERONE_WEBHOOK_SECRET`. It is used as plain UTF-8 text: do not hex- or base64-decode it. An empty secret is a configuration error, and the examples reject every request while it is unset.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 hackerone --path /webhooks/hackerone
```

Use the printed URL as the webhook URL in HackerOne. (FastAPI examples run on port 8000.)

## Testing

Trigger a real event on a test program (for example, submit a report) and check the `X-H1-Event` header on the delivery. Delivery behaviour (retries, timeouts, success codes) is not documented by HackerOne, so respond with `2xx` quickly.
