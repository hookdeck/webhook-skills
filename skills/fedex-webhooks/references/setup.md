# Setting Up FedEx Webhooks

## Prerequisites

- A FedEx Developer Portal login. That's enough for "Try this webhook".
- For real subscriptions: an organization in the portal with eligible US billing and shipping account numbers
- A public HTTPS endpoint (use the Hookdeck CLI locally)

## 1. Choose a Security Token

Pick a token of 26 to 100 characters with at least one uppercase letter, one lowercase letter and one digit. FedEx uses it as the HMAC key. Set `FEDEX_WEBHOOK_SECURITY_TOKEN` to it.

## 2. Try This Webhook

In the portal, open the Advanced Integrated Visibility docs or **My Projects > Advanced Integrated Visibility** and click **Test Webhook URL** / **Try this Advanced Integrated Visibility**. Enter:

| Field | Value |
|---|---|
| Destination URL | Your HTTPS endpoint |
| Security Token | The token from step 1 |
| Payload language | Your preferred language |
| Tracking Type | Detailed or event-specific tracking response |

FedEx sends a signed mock tracking payload. See [Test Webhook](https://developer.fedex.com/api/en-us/catalog/shipment-visibility-webhook/docs/introduction/test-webhook.html).

## 3. Create an AIV Webhook Project

Create the project in the portal, enter the destination URL and security token, and subscribe it by account number or by tracking number. FedEx validates the URL on creation and needs a `200` or `202`. Changes can take up to 10 minutes to take effect.

### Local testing with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 fedex --path /webhooks/fedex
```

Use the printed URL as the destination URL in "Try this webhook".

## Using Hookdeck

Create a source with the **FedEx** source type and paste the security token. Hookdeck verifies `fdx-signature`. Verification is optional on the source, and Hookdeck applies no timestamp window.
