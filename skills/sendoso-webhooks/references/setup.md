# Setting Up Sendoso Webhooks

## Prerequisites

- A Sendoso account with access to the **integrations page**
- Webhooks enabled for your organization (step 1)
- A publicly reachable HTTPS endpoint (for local development, use a Hookdeck CLI tunnel; see below)

## Step 1: Ask Sendoso to Enable Webhooks

Webhooks are opt-in and off by default. Contact Sendoso support at **developers@sendoso.com** and ask them to enable webhooks for your organization.

## Step 2: Open the Webhooks Portal

Once webhooks are enabled, go to Sendoso's **integrations page** and get the **webhooks portal URL**. The portal is a Svix app portal where you manage everything below. Sendoso doesn't offer an API for creating endpoints.

## Step 3: Add an Endpoint

1. In the portal, add an endpoint with your URL, for example `https://your-app.com/webhooks/sendoso`.
2. Select the event types you want, such as `send.shipped`, `send.delivered` and `send.redeemed`. **If you select none, the endpoint receives every event type.**
3. Save.

The payload doesn't name its event type (see [overview.md](overview.md#which-status-did-the-send-change-to)). If different statuses need different handling, consider separate endpoints, each subscribed to its own events.

## Step 4: Copy the Signing Secret

Open the endpoint in the portal and copy its **signing secret**. It looks like `whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw`. Secrets are **unique per endpoint**, so each endpoint URL needs its own value.

```bash
SENDOSO_WEBHOOK_SECRET=whsec_...
```

## Step 5: Send a Test Event

On the endpoint's **Testing** tab, send an example event. Then open the message to see the payload, every delivery attempt, and whether each attempt succeeded.

## Local Development

Run the Hookdeck CLI via `npx` (no install or account required):

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 sendoso --path /webhooks/sendoso

# FastAPI
npx hookdeck-cli listen 8000 sendoso --path /webhooks/sendoso
```

Add the printed URL as an endpoint in step 3. The CLI web UI shows the exact headers and body of each delivery.

## Firewalls (IP Allowlist)

If your endpoint is behind a firewall or NAT, allow traffic from Sendoso's published US webhook IPs:

```
44.228.126.217
50.112.21.217
52.24.126.164
54.148.139.208
2600:1f24:64:8000::/52
```

An allowlist adds a layer of protection. You still need to verify signatures.

## Keep Endpoints Healthy

- Return a `2xx` within **15 seconds**. Queue slow work.
- If every attempt to an endpoint fails for **5 days**, Sendoso disables it. Find it in the portal and choose **Enable Endpoint**.
- After downtime, open the endpoint and use **Options > Recover Failed Messages** to replay a time window, or resend single messages from the message view.
- Return non-`2xx` codes for real failures. Sendoso treats any `2xx` as delivered.
