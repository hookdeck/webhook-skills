# Setting Up Twilio Webhooks

## Prerequisites

- A [Twilio account](https://www.twilio.com/try-twilio) with an active phone number (or messaging service)
- Your application's webhook endpoint, publicly accessible over HTTPS
- Your Twilio **Auth Token** (the webhook signing key — *not* the Account SID)

## Get Your Auth Token

1. Sign in to the [Twilio Console](https://console.twilio.com).
2. On the **Account Info** panel of the dashboard, copy:
   - **Account SID** — `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - **Auth Token** — used to verify `X-Twilio-Signature`

> **Security note:** Treat the Auth Token like a password. Anyone with it can both call the Twilio API on your behalf and forge webhook signatures. If it leaks, rotate it from the Console.

## Configure a Messaging Webhook (Incoming SMS / MMS)

1. In the Console, go to **Phone Numbers → Manage → Active numbers**.
2. Click the number you want to configure.
3. Under **Messaging Configuration → A message comes in**, choose **Webhook**.
4. Enter your endpoint URL, e.g. `https://example.com/webhooks/twilio`.
5. Set the HTTP method to **HTTP POST**.
6. Save.

For shared/multi-number setups, configure the same webhook on your **Messaging Service** instead.

## Configure a Voice Webhook (Incoming Voice Calls)

1. In the Console, go to **Phone Numbers → Manage → Active numbers** and select your number.
2. Under **Voice Configuration → A call comes in**, choose **Webhook**.
3. Enter the URL and select **HTTP POST**.
4. Save.

## Configure Outbound Status Callbacks

Outbound message and call status callbacks are configured **per request** when creating the resource via the REST API or SDK — they aren't set in the Console.

**Outbound message with status callback:**

```javascript
await client.messages.create({
  from: '+14155552671',
  to: '+14155552672',
  body: 'Hello!',
  statusCallback: 'https://example.com/webhooks/twilio',
});
```

You can also set a default `Status Callback URL` on a Messaging Service so every outbound message reports status to the same endpoint.

**Outbound call with status callback:**

```javascript
await client.calls.create({
  from: '+14155552671',
  to: '+14155552672',
  url: 'https://example.com/voice-twiml',
  statusCallback: 'https://example.com/webhooks/twilio',
  statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
  statusCallbackMethod: 'POST',
});
```

## Switch Webhooks to JSON

By default, Twilio sends `application/x-www-form-urlencoded`. Some products allow you to opt into JSON payloads. When you do, Twilio appends a `bodySHA256` query parameter to your URL and includes it in the signed string — your verification logic must account for it. The Twilio SDKs handle this automatically.

## Test Webhooks Locally

You need a public HTTPS URL. Two common options:

```bash
# Hookdeck CLI (no account required)
npx hookdeck-cli listen 3000 twilio --path /webhooks/twilio

# ngrok
ngrok http 3000
```

Copy the printed public URL into the Twilio Console webhook field, and append your path (e.g. `https://abc123.hookdeck.app/webhooks/twilio`).

> **Common pitfall:** Twilio computes the signature over the **exact URL** you configured. If you change ports or paths during testing, signature verification will fail until you re-save the URL in the Console.

## Verify the Webhook Fires

1. Send a test SMS to your configured number, or trigger an outbound message with the status callback URL set.
2. Check your server logs for the request body and `X-Twilio-Signature` header.
3. If using Hookdeck, inspect the request in the [Hookdeck dashboard](https://dashboard.hookdeck.com) and replay it as needed.

## Further Reading

- [Twilio Console](https://console.twilio.com)
- [Configure messaging webhooks](https://www.twilio.com/docs/messaging/guides/webhook-request)
- [Track outbound message status](https://www.twilio.com/docs/messaging/guides/track-outbound-message-status)
