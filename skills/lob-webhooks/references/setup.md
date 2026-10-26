# Setting Up Lob Webhooks

## Prerequisites

- A Lob account (Test and Live are configured separately)
- A publicly reachable HTTPS URL for your endpoint (Lob enforces HTTPS and needs a fully chained certificate)
- Account Administrator access if you want to set rate limits or replay events

## Heads up: debugger events fail verification

Events sent from Lob's webhook debugger are signed with a fixed test secret, so they fail verification. Real deliveries are signed with the webhook's secret.

Lob's docs say the debugger signs with the literal string `secret`. To check your verification
code against debugger events, temporarily set `LOB_WEBHOOK_SECRET=secret`, then switch back to the
webhook's own secret for real deliveries.

## Get Your Signing Secret

1. Go to the Lob dashboard and choose **Webhooks** in the left navigation bar.
2. Open your webhook to see its **details page**.
3. Copy the webhook's secret. It is unique per webhook, and you use it as-is (its UTF-8 bytes) as the HMAC key.
4. Store it as `LOB_WEBHOOK_SECRET`.

## Register Your Endpoint

1. In **Webhooks**, choose the **Test** or **Live** environment and click **Create**.
2. Add a name in the **Description** field.
3. Enter your endpoint URL (for example `https://example.com/webhooks/lob`; use the Hookdeck CLI URL for local development).
4. Optionally edit the rate limit.
5. Select the event types (for example `postcard.delivered` under Postcards).
6. Click **Create**.

Your endpoint must accept a `POST` with a JSON body and return a `2xx` quickly. Exempt it from CSRF protection if your framework enables it by default.

## Local Development

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 lob --path /webhooks/lob

# FastAPI
npx hookdeck-cli listen 8000 lob --path /webhooks/lob
```

Use the URL the CLI prints as the webhook URL in the dashboard.

## Test Mode vs Live Mode

- Webhooks in the **Test** environment receive events from your Test API key; Live webhooks receive events from your Live key. Create a webhook in each environment you use, each with its own secret.
- Tracking events (`*.in_transit`, `*.delivered`, ...) exist only in Live. In Test, use the webhook **Debugger** to send mock events (sample IDs and URLs are fake).
- Optional: Basic Auth can be added by putting credentials in the URL (`https://username:password@example.com/webhooks`). Lob recommends signature verification over relying on Basic Auth alone.
