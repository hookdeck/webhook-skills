# Setting Up Travtus Webhooks

## Prerequisites

- Access to the Travtus API and webhooks (see Travtus's [getting started](https://docs.travtus.com/travtus-api-and-webhook/request-access) page)
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Get a Travtus Webhook Set Up?

Travtus sets up webhooks through support. The Hookdeck source's configuration alert says it
exactly: "Travtus sets up webhooks through support@travtus.com and sends you the whsec_ secret. Paste it here."

1. Email [support@travtus.com](mailto:support@travtus.com) with the URL where you want to
   receive webhook events, e.g. `https://example.com/webhooks/travtus`.
2. Travtus sets up the webhook and sends you a signing secret that looks like `whsec_...`.
   Each endpoint has its own secret.
3. Keep the full value, prefix included:

```bash
TRAVTUS_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

If the value doesn't start with `whsec_`, the examples reject it with a 500 instead of verifying
with the wrong key.

## Can I Add or Change Endpoints Myself?

Yes, through the webhook portal. Request a short-lived portal URL with
`GET https://api.travtus.com/webhook/app-portal-access/` and an `Authorization: Bearer <token>`
header. The response is `{ "url": "..." }`. In the portal:

1. Open **Endpoints** and add your endpoint URL.
2. Pick the event types to receive: `lease.update`, `task.create`, `task.update`, `task.delete`,
   `sms.respond`, `email.respond`, `web_chat.respond`. With none selected the endpoint receives
   every event. A good start while testing.
3. Use **Svix Play** for a temporary URL if your service isn't ready.

## How Do I Send a Test Event?

Use the portal's **Testing** tab to send example events to your endpoint, then open the message
to see the payload, attempts and status. Test events are signed like real deliveries.

## Replaying and Recovering Failed Messages

In the portal, open a message's options menu and choose **resend** to replay one event, or use
**Recover Failed Messages** to retry everything that failed since a date. If an endpoint was
disabled after 5 days of failures, find it in the portal and choose **Enable Endpoint**.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| Every delivery fails verification | The handler verifies a re-serialized body instead of the raw bytes, or uses another endpoint's secret |
| No deliveries arrive | The endpoint isn't set up yet, is disabled, or isn't subscribed to the event type you expect |
| Timeouts and retries | The handler takes longer than 15 seconds: acknowledge first, process async |
| "Timestamp too old" on retries or replays | The SDK's fixed 5-minute window; see [verification.md](verification.md) |

Questions: [support@travtus.com](mailto:support@travtus.com).
