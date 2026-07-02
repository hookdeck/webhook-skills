# Setting Up Adyen Webhooks

## Prerequisites

- An Adyen account with access to the [Customer Area](https://ca-live.adyen.com/)
  (use [ca-test.adyen.com](https://ca-test.adyen.com/) for the test environment).
- Merchant or Company-level access to configure webhooks.
- Your application's publicly reachable webhook endpoint URL
  (e.g. `https://your-app.com/webhooks/adyen`).

## Register Your Webhook

1. Log in to your **Customer Area**.
2. Go to **Developers → Webhooks**.
3. Select **+ Webhook**, then choose **Standard webhook**.
4. Under **General**, set the **Server configuration → URL** to your endpoint
   (e.g. `https://your-app.com/webhooks/adyen`).
5. Choose the **Method** as **JSON** (recommended). Adyen sends one
   `NotificationRequestItem` per POST with a JSON body.
6. Select the **merchant accounts** and **event codes** you want to receive
   (e.g. `AUTHORISATION`, `CAPTURE`, `REFUND`, `CANCELLATION`, `CHARGEBACK`).

## Generate the HMAC Key (Signing Secret)

1. In the webhook's settings, find the **Security → HMAC Key** section.
2. Select **Generate** to create a new HMAC key.
3. **Copy the generated key immediately** — it is a **hexadecimal string** (e.g.
   `44782DEF547AAA06C910C43932B1EB0C71FC68D9D0C057550C48EC2ACF6BA056`). You cannot
   view it again after leaving the page.
4. Store it as `ADYEN_HMAC_KEY` in your environment.

> **The HMAC key is a hex string.** Your code must **hex-decode it to bytes**
> before using it as the HMAC-SHA256 key. See
> [verification.md](verification.md).

## Configure Basic Auth (Recommended)

Adyen webhooks support **Basic authentication** in addition to HMAC signing. It is
strongly recommended to enable both.

1. In the webhook's **Security → Authentication** section, set a **username** and
   **password**.
2. Store them as `ADYEN_WEBHOOK_USERNAME` and `ADYEN_WEBHOOK_PASSWORD`.
3. Adyen sends these as an HTTP `Authorization: Basic <base64(username:password)>`
   header on every webhook. Reject requests whose credentials don't match.

> HMAC verifies the **payload is authentic and untampered**; Basic Auth restricts
> **who can reach the endpoint**. Use both — HMAC is the security-critical check.

## Test Your Webhook

1. In the webhook settings, use **Test configuration** to send a test webhook from
   Adyen to your endpoint.
2. Adyen shows the HTTP response it received — confirm it is `200` with body
   `[accepted]`.
3. In the **test environment**, create a real test payment to trigger a genuine
   `AUTHORISATION` webhook.

## Test vs Live

- The **test** Customer Area (`ca-test.adyen.com`) and **live** Customer Area
  (`ca-live.adyen.com`) have **separate** webhook configurations and **separate**
  HMAC keys.
- The webhook payload's `live` field is `"false"` in test and `"true"` in live.
- Generate and store a **distinct `ADYEN_HMAC_KEY` per environment**.

## Local Development

Use the Hookdeck CLI to receive live webhooks on your local machine — no account
required:

```bash
npx hookdeck-cli listen 3000 adyen --path /webhooks/adyen
```

This gives you a public URL to paste into the Customer Area webhook **URL** field,
plus a web UI to inspect and replay requests.
