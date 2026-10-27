# Setting Up Novu Webhooks

## Prerequisites

- A Novu account on a plan that includes outbound webhooks. Hookdeck's configuration alert for
  this source reads: "Novu outbound webhooks are available on the Team and Enterprise plans."
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Register a Novu Webhook Endpoint?

1. Open the [Webhooks page](https://dashboard.novu.co/webhooks) in the Novu dashboard.
2. Select the **Endpoints** tab and click **Add Endpoint**.
3. Choose **Webhook** to receive events over HTTP. (**Polling Endpoint** and **FIFO Endpoint** are
   alternative HTTP modes, and connectors deliver to a warehouse, object store or queue instead.
   This skill covers the **Webhook** type.)
4. Enter your HTTPS URL, e.g. `https://example.com/webhooks/novu`, and a description.
5. Select the event types to receive: message delivery, workflow changes, preference updates and
   inbound email on a verified domain.
6. Optionally set a rate limit and a transformation under advanced settings. Custom headers can
   only be added after the endpoint exists.
7. Click **Create**.

Frameworks with CSRF protection must exempt this route, since the signature and timestamp are
your authentication.

## Where Do I Find the Signing Secret?

Each endpoint has its own signing secret. Novu's docs show only a placeholder
(`YOUR_WEBHOOK_SECRET_KEY`); the dashboard's Webhooks page is a Svix portal, so the real value is
Svix's `whsec_<base64>` form. Store the full value, prefix included:

```bash
NOVU_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

The HMAC key is the base64-decoding of the part after `whsec_`. If the value doesn't start with
`whsec_`, the examples reject it with a 500 instead of verifying with the wrong key. Novu's docs
don't print the prefix themselves, so check it against what the dashboard shows.

## How Do I Test an Endpoint?

Open the endpoint, choose the **Testing** tab, pick an event type and click **Send Example**.
You can then see the payload, every attempt and whether it succeeded.

## Respond Quickly

Return a `2xx` within 15 seconds. Acknowledge fast and process on a queue. Return `200` for events
you don't handle, otherwise Novu keeps retrying them.

## Watching and Replaying Deliveries

The endpoint's **Logs** tab lists each attempt. Under **Webhook Attempts**, the (...) menu has
**Resend**. A replay reuses the original payload and `webhook-id`, so your deduplication treats it
as the same message. For bulk recovery, open the endpoint's (...) menu and choose **Recover failed
messages** or **Replay missing messages**, then pick a time window.

## Disabled Endpoints

When every attempt fails for 5 consecutive days Novu disables the endpoint. Fix the endpoint, then
re-enable it from the (...) menu on the Endpoints tab.
