# Setting Up Liveblocks Webhooks

## Prerequisites

- A Liveblocks project in the [dashboard](https://liveblocks.io/dashboard)
- Your application's public HTTPS webhook URL (use the Hookdeck CLI for local development)

## How Do I Register a Webhook Endpoint?

1. From the dashboard overview, open the project you want webhooks for.
2. Click the **Webhooks** tab in the left-hand menu.
3. Click **Add endpoint...**.
4. Enter your endpoint URL, or click **use a test endpoint** to generate a URL at `https://webhooks.liveblocks.io/test/<token>`.
5. Select the events you want to subscribe to. An endpoint listens to all events by default; narrow it with Message Filtering.
6. Click **Add endpoint**.

Your endpoint must return a `2xx` status (200 to 299). Anything else is treated as a failure and retried, see [verification.md](verification.md) and the SKILL.md delivery notes. To change subscribed events later, select the endpoint, choose **Edit endpoint...** from its top-right menu, update the selection and click **Save changes**.

## Where Is My Signing Secret?

Each endpoint has its own secret in the webhooks dashboard. It starts with `whsec_`. Store the full value, prefix included, in `LIVEBLOCKS_WEBHOOK_SECRET`. Keep it out of client-side code and version control.

## How Do I Test an Endpoint?

**Test endpoint (no server needed):** create the endpoint with **use a test endpoint**, select it, open its top-right menu and choose **Test endpoint...**. Pick an event type and click **Send example**. Open the event in the delivery history, then under **Webhook attempts** open the attempt's menu and choose **Show response body**. The body is a JSON receipt with the request time, method, URL, selected request headers and up to 4 KiB of the request body. Test endpoints don't forward to your local server.

**Your own handler locally:** start a tunnel and register its URL as a normal endpoint, then use **Test endpoint...** and **Send example** on it to deliver a signed event.

```bash
# Express / Next.js (use 8000 for FastAPI). No install or account required.
npx hookdeck-cli listen 3000 liveblocks --path /webhooks/liveblocks
```

You can also use localtunnel or ngrok. Liveblocks has a guide on [testing webhooks on localhost](https://liveblocks.io/docs/guides/how-to-test-webhooks-on-localhost).

## Replaying Failed Deliveries

If your service is unreachable, Liveblocks retries automatically. After considerable downtime (over 8 hours) you can replay a single message from the endpoint's message list (kebab menu on the message), or bulk replay with **Recover failed messages...** in the top-right dropdown. If every delivery to an endpoint fails for 5 consecutive days, the endpoint is disabled automatically; re-enable it from the dashboard.

## Notification Timing

`notification` events default to 30 minutes after the activity. Change the delay in the project's settings in the dashboard.

## IP Allowlists

Liveblocks no longer sends from a fixed set of IP addresses, and older published addresses are no longer valid. Don't restrict your endpoint by source IP; if a firewall or NAT sits in front, allow traffic from any address and rely on signature verification.
