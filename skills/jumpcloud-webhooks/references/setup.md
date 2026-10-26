# Setting Up JumpCloud Webhooks

## Prerequisites

- A JumpCloud Admin Portal login with access to Settings
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 jumpcloud --path /webhooks/jumpcloud` locally)

## Create the Webhook Channel

1. Log in to the JumpCloud Admin Portal and go to **Settings > Notification Channels**.
2. Click **Webhooks**, then **+Add**.
3. Leave **Webhook Status** Enabled (or disable it and enable it later).
4. Enter a unique name (up to 100 characters) and your **URL**, for example
   `https://example.com/webhooks/jumpcloud`.
5. **Verify SSL Certificate** is checked by default. JumpCloud's page words it the other way
   round from what the name suggests: "When enabled, self-signed certificates are allowed during
   webhook delivery. When disabled, self-signed certificates are not allowed." Either way, give
   the endpoint a certificate from a trusted CA (Hookdeck URLs already have one).
6. Optionally mask sensitive parts of the URL with **Protect sensitive data in the URL** (up to
   10 rows; once saved you can't view or edit them).

## Set Basic Authentication

1. Under authentication, choose **Basic Authentication**.
2. Enter a **Username** and **Password**. Use a long random password.
3. Store them as `JUMPCLOUD_WEBHOOK_USERNAME` and `JUMPCLOUD_WEBHOOK_PASSWORD`.

JumpCloud sends them as `Authorization: Basic base64(username:password)`. They must be present on
the first request: a `401` + `WWW-Authenticate` challenge flow won't work (and doesn't work through
Hookdeck, which verifies the request as received).

## Send Notifications to the Channel

Creating the channel isn't enough: add it to a rule (see JumpCloud's "Configure Rules for
JumpCloud Alerts"). For Access Requests, create the channel, then pick the events under
**Access > Access Requests**.

## Test

Click **Test Webhook** on the channel to see a simulated request and response, then **Save**.
Or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/jumpcloud \
  -u "$JUMPCLOUD_WEBHOOK_USERNAME:$JUMPCLOUD_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"alert_id":"alert-0001","alert_title":"Illustrative alert","priority":"High","status":"Open"}'
```

## Network Notes

JumpCloud publishes region-specific FQDNs and IP addresses (see "JumpCloud Data Centers") if you
need a firewall allowlist. The Basic credentials remain the authentication.
