# Setting Up WhatsApp Webhooks

## Prerequisites

- A [Meta for Developers](https://developers.facebook.com/) app with the **WhatsApp**
  product added.
- A WhatsApp Business Account (WABA) and a phone number connected to the Cloud API.
- Your application's public HTTPS webhook endpoint (a valid TLS certificate is
  **required** — self-signed certs are rejected).

## Get Your Two Secrets

WhatsApp webhooks use **two different values** — don't mix them up:

1. **App Secret** — signs every POST (`X-Hub-Signature-256`).
   - Meta App Dashboard → **App Settings → Basic → App Secret** → click **Show**.
   - Store it as `WHATSAPP_APP_SECRET`.
2. **Verify Token** — a string **you invent**, used only for the GET handshake.
   - Generate any random string (e.g. `openssl rand -hex 20`).
   - Store it as `WHATSAPP_VERIFY_TOKEN`; you'll paste the same value into the
     dashboard in the next step.

## Register Your Endpoint

### Option A — App Dashboard (recommended)

1. Meta App Dashboard → **WhatsApp → Configuration**.
2. Under **Webhook**, click **Edit**.
3. Enter:
   - **Callback URL**: `https://your-domain.com/webhooks/whatsapp`
   - **Verify token**: the same value as `WHATSAPP_VERIFY_TOKEN`.
4. Click **Verify and save**. Meta immediately sends a `GET` to your callback URL:

   ```
   GET /webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<YOUR_TOKEN>&hub.challenge=1158201444
   ```

   Your endpoint must respond `200` with the **raw `hub.challenge` value** as the body
   (plain text — no JSON, no quotes). If the token doesn't match, return `403`.
5. Under **Webhook fields**, click **Manage** and **subscribe** to the fields you
   need — at minimum **`messages`** (covers inbound messages and status updates).

### Option B — Graph API

Subscribe your app to the WABA's `whatsapp_business_account` object programmatically:

```bash
curl -X POST "https://graph.facebook.com/v24.0/<WABA_ID>/subscribed_apps" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

To configure the app-level callback URL and fields via the Graph API, use the
`/{app-id}/subscriptions` edge with `object=whatsapp_business_account`.

## Test Mode vs. Live Mode

- You can test with the number in the **API Setup** panel while the app is in
  development, but **some webhooks only fire when the app is in Live mode**.
- Switch to **Live** in the app dashboard header once your endpoint is verified and
  you're ready for production traffic.

## Verify It Works

Send a WhatsApp message to your business number (or use the **API Setup → Send
message** test) and confirm a `POST` with `field: "messages"` and a populated
`value.messages[]` reaches your handler with a valid `X-Hub-Signature-256`.

## Local Development

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 whatsapp --path /webhooks/whatsapp
```

Use the printed URL as the **Callback URL** in the dashboard. The CLI provides a web
UI for inspecting and replaying requests.
