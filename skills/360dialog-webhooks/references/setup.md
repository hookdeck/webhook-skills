# Setting Up 360dialog Webhooks

## Prerequisites

- A 360dialog account with a WhatsApp number and its `D360-API-KEY`
- A public HTTPS endpoint with a valid certificate (use the Hookdeck CLI locally)

## Webhook URL Rules

- Production URLs must be HTTPS with a valid SSL certificate.
- Domain names can't contain underscores or explicit ports (`https://sub.example.com:3000` and
  `https://your_webhook.example.com` are invalid).
- The URL is set once and can be updated or removed at any time, in the 360dialog Hub UI
  (API Settings for the number) or with the API.

## Set the Webhook URL With Basic Auth

To have 360dialog authenticate to your server, pass an `Authorization` header with the
webhook URL. The value is `Basic base64(USER:PASS)`. Choose USER and PASS yourself and
base64-encode `USER:PASS`:

```bash
printf '%s' "$USER:$PASS" | base64
```

**Hub UI:** select the WhatsApp number, open API Settings, click the pencil or three-dots
icon, choose the channel or WABA webhook, enter the endpoint and the (optional) header, save,
then confirm the verification code sent by email.

**API:** the webhook URL is set by API with a JSON body containing `url` and a `headers`
object. The docs' example (`USER=testuser`, `PASS=testpass`):

```json
{ "url": "https://www.example.com/webhook",
  "headers": { "Authorization": "Basic dGVzdHVzZXI6dGVzdHBhc3M=" } }
```

Send it to the webhook endpoint listed in the 360dialog API reference, authenticated with your
`D360-API-KEY` header (API host `waba-v2.360dialog.io`). The API also has a multi-webhook
feature (`/multi_webhook`) whose destinations each take a `name`, `url` and custom `headers`.

Store `USER` and `PASS` as `THREE_SIXTY_DIALOG_WEBHOOK_USERNAME` and
`THREE_SIXTY_DIALOG_WEBHOOK_PASSWORD`. To rotate them, set the webhook URL again with new headers.

## Phone Number vs WABA Webhooks

A phone-number webhook is the primary, recommended setting and receives only that number's
events. A WABA webhook is used when no number webhook exists and receives events for every
number on the account. With neither, callbacks return empty responses.

## Coexistence Webhooks

For numbers on both the WhatsApp Business app and the Platform, `smb_message_echoes` is sent to
the phone-number webhook; `history` and `smb_app_state_sync` go to the partner-configured
webhook shortly after onboarding (and `smb_app_state_sync` to the number webhook once set).

## Local Testing

```bash
npx hookdeck-cli listen 3000 360dialog --path /webhooks/360dialog
```

Use the printed URL as `url` (with the `Authorization` header). For FastAPI, use port `8000`.

## Sending a Manual Test

```bash
curl -X POST http://localhost:3000/webhooks/360dialog \
  -H "Content-Type: application/json" \
  -u "$THREE_SIXTY_DIALOG_WEBHOOK_USERNAME:$THREE_SIXTY_DIALOG_WEBHOOK_PASSWORD" \
  -d '{"object":"whatsapp_business_account","entry":[{"id":"WABA_ID","changes":[{"field":"messages","value":{"messaging_product":"whatsapp","statuses":[{"id":"wamid.ID","status":"read","recipient_id":"16315551234"}]}}]}]}'
```
