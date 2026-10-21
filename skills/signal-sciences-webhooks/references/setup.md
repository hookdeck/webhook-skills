# Setting Up Signal Sciences Webhooks

## Prerequisites

- A Fastly Next-Gen WAF (Signal Sciences) account with permission to manage workspace alerts or site integrations
- A publicly reachable HTTPS URL for your endpoint (use the Hookdeck CLI for local development)

## Add the Integration

### Fastly control panel

1. Log in to the Fastly control panel.
2. Go to **Security** > **Next-Gen WAF** > **Workspaces**.
3. Click the gear next to the workspace you want to modify.
4. Click **Alerts**, then **Add alert**.
5. Set **Integration type** to **Webhook**.
6. Enter your endpoint in **Webhook URL**.
7. In **Select activities**, leave **Flagged IPs** checked.
8. Click **Add workspace alert**.

### Next-Gen WAF control panel

1. Log in to the Next-Gen WAF control panel and pick a site from the **Sites** menu.
2. From **Manage**, choose **Site Integrations**, then **Add site integration**.
3. Select **Generic Webhook** and enter the **Webhook URL**.
4. Choose **All activity** or **Specific activity** (and pick the activity types).
5. Click **Create site integration**.

## Get Your Signing Key

A signing key is generated when the integration is created. Every request carries `X-SigSci-Signature`, an HMAC-SHA256 hex digest computed with that key.

1. Open the alert (pencil icon) or the site integration.
2. Click **Reveal** to see the full signing key.
3. Store it as `SIGNAL_SCIENCES_SIGNING_KEY`. Use it as the raw string.

### Rotate the Key

Click **Rotate** on the alert or integration. For workspace alerts you don't need to click **Update workspace alert** to save the new key. Update your environment variable at the same time, since deliveries are signed with the new key immediately.

## Authentication

The only authentication is the HMAC signature. There is no basic auth, API key header, or documented IP allowlist, so always verify the signature.

## Testing

Create an alert for **Flagged IPs** (or the activity types you need) and trigger the activity, or replay a captured request through the Hookdeck CLI: `npx hookdeck-cli listen 3000 signal-sciences --path /webhooks/signal-sciences`.
