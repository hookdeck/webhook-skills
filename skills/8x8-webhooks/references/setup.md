# Setting Up 8x8 Webhooks

## Prerequisites

- An 8x8 Connect account (SMS API and/or Chat Apps enabled)
- A public HTTPS endpoint for your webhook receiver (use the Hookdeck CLI locally)

## Create the Webhook and HTTP Authorization Value

1. Sign in to the 8x8 Connect portal and open **Developer Tools → Webhooks**
   (https://connect.8x8.com/webhooks).
2. Click **Add webhook**.
3. Choose the sub-account (or all sub-accounts) and the type: **SMS** (inbound SMS and
   delivery receipts on one webhook), **Messaging Apps** or **Voice**.
4. Enter your endpoint URL, for example `https://example.com/webhooks/8x8`.
5. Fill in the optional **HTTP Authorization** field with a string of your choice, such as
   `Bearer 9QQhlsEb8VY` or `Basic dXNlcjpwYXNzd29yZA==`. 8x8 adds it to every webhook
   request as the `Authorization` header.
6. Save, and make sure the webhook is enabled.

Paste the HTTP Authorization value exactly as set in 8x8, including any "Bearer " or
"Basic " prefix. OAuth authentication is not supported.

Store the full value as `EIGHT_X_EIGHT_AUTHORIZATION`. Your handler compares the whole
`Authorization` header to it; it never strips the prefix or decodes a Basic value.

## Configure via API

The Webhooks Configuration API (`POST /api/v1/accounts/{accountId}/webhooks`) accepts the
same value as `httpAuthorization`. Use `*` for the sub-account to receive events across all
sub-accounts. Inbound SMS, short URL clicks and some Chat Apps events must also be enabled
by your 8x8 account manager.

## Local Testing

```bash
npx hookdeck-cli listen 3000 8x8 --path /webhooks/8x8
```

Use the printed URL as the webhook URL. For FastAPI, use port `8000`.

## Sending a Manual Test

```bash
curl -X POST http://localhost:3000/webhooks/8x8 \
  -H "Content-Type: application/json" \
  -H "Authorization: $EIGHT_X_EIGHT_AUTHORIZATION" \
  -d '{"namespace":"SMS","eventType":"inbound_message_received","description":"SMS inbound message","payload":{"umid":"9e09ac86-bd74-5465-851d-1eb5a5fdbb9a","source":"+6581968289","destination":"+4534735477","body":"Test MO message"}}'
```

## Notes

- 8x8 documents callback URLs as `https://` (release notes, 2026-09-02); use HTTPS so the credential is not sent in clear text.
- Respond with 200 quickly; 4xx and 5xx responses trigger retries.
- Rotating the credential means editing the webhook in 8x8 and updating
  `EIGHT_X_EIGHT_AUTHORIZATION` together.
