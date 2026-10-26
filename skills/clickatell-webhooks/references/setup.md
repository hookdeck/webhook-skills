# Setting Up Clickatell Webhooks

Hookdeck's Clickatell source shows this note, and it applies here too: "Covers One API callbacks only. Add a Custom Security Header to the callback URL."

Basic Auth alone and legacy SMS Gateway callbacks are not covered by Hookdeck's Clickatell source.

## Prerequisites

- A Clickatell portal account with an active One API integration (WhatsApp and/or SMS)
- A role with the Custom Security Headers permission (if the option is missing, ask Clickatell Support)
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 clickatell --path /webhooks/clickatell` locally)

## Pick a Header Name and Value

Callbacks are unsigned, so the header value is a shared secret. Generate a long random value, for
example `openssl rand -hex 32`, and save it before configuring: **Clickatell cannot show it again
after you save.**

| Limit | Value |
|-------|-------|
| Headers per callback URL | 5 |
| Header name | Max 64 characters: letters, digits, `-`, `_` |
| Header value | Max 512 characters |

Any name works (for example `X-Webhook-Secret`). If you name the header `Authorization`, it
**overrides** any Basic Auth configured for that callback URL: only your custom value is sent.
Whichever name you use, your handler compares the whole value.

## Register Your Endpoint

1. In the Clickatell portal, open your One API integration settings.
2. Set the **Status Callback URL** and/or **Reply Callback URL** to your endpoint, e.g.
   `https://example.com/webhooks/clickatell`.
3. Under **Custom Security Headers** for that URL, click **Add Header**, enter the name and value,
   and save.
4. Repeat for the other callback URL. Header sets are configured separately for status and reply
   callbacks, though the name and value can be the same.
5. Set your environment variables to match:

```bash
CLICKATELL_WEBHOOK_HEADER=X-Webhook-Secret    # default: Authorization
CLICKATELL_WEBHOOK_SECRET=the-value-you-saved # exact value, including any "Bearer " prefix you typed
```

Callback payloads are JSON. Any 2xx acknowledges them.

## Rotate the Secret

Open the header under Custom Security Headers, choose **Update** and enter a new value. Caching
means the old value may be sent for a few seconds, so accept both briefly, or expect a few 401s.
Update `CLICKATELL_WEBHOOK_SECRET` at the same time.

## Test

Send a message through One API and watch for `messageStatusUpdate` on your status callback URL, or
replay one with curl:

```bash
curl -X POST http://localhost:3000/webhooks/clickatell \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $CLICKATELL_WEBHOOK_SECRET" \
  -d '{"integrationId":"abc","integrationName":"My integration","event":{"messageStatusUpdate":[{"channel":"whatsapp","timestamp":1506607698860,"statusCode":5,"status":"DEVICE_ACK","messageId":"3a89680503414383af44dcd0e4e5f184"}]}}'
```
