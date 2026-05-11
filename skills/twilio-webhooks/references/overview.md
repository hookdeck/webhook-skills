# Twilio Webhooks Overview

## What Are Twilio Webhooks?

Twilio uses webhooks (also called "callbacks") to notify your application about communications events: incoming SMS messages, incoming voice calls, message delivery status changes, recording completion, and more. Twilio sends an HTTP POST request to a URL you configure in the Twilio Console (or on the resource itself, e.g. when creating a message via the REST API and passing `StatusCallback`).

Two response patterns:

- **Interactive webhooks** (incoming SMS, incoming voice) expect a [TwiML](https://www.twilio.com/docs/voice/twiml) XML response telling Twilio what to do next — reply with a message, say something, gather digits, etc.
- **Status callbacks** (message status, call status, recording status) are informational; respond with any 2xx (typically `204 No Content`).

## Content Type

Most Twilio webhooks are sent as `application/x-www-form-urlencoded`. A subset of newer products can be configured to send `application/json` — when they do, Twilio appends a `bodySHA256` query parameter to the URL it signs.

## Common Webhook Types

Twilio does not put an `event` field in the body. The "event" is implied by which URL Twilio called (Messaging webhook URL vs Voice URL vs Status Callback URL) and by which parameters are present.

| Webhook | Identifying Parameters | Typical Response |
|---------|------------------------|------------------|
| Incoming SMS / MMS | `MessageSid`, `From`, `To`, `Body`, `NumMedia` | TwiML `<Response><Message>…</Message></Response>` |
| Incoming voice call | `CallSid`, `From`, `To`, `CallStatus`, `Direction` | TwiML `<Response><Say>…</Say></Response>` |
| Message status callback | `MessageSid`, `MessageStatus` | `204 No Content` |
| Call status callback | `CallSid`, `CallStatus` | `204 No Content` |
| Recording status callback | `RecordingSid`, `RecordingStatus`, `RecordingUrl` | `204 No Content` |

## Message Status Values

The `MessageStatus` parameter in a message status callback is one of:

| Status | Meaning |
|--------|---------|
| `queued` | Message accepted by Twilio, waiting to be sent |
| `sending` | Currently being sent to the carrier |
| `sent` | Carrier accepted the message |
| `delivered` | Carrier confirmed delivery to the handset |
| `undelivered` | Carrier reported the message could not be delivered |
| `failed` | Twilio could not send (check `ErrorCode`) |

WhatsApp and some other channels also emit `read` and `accepted`.

## Call Status Values

The `CallStatus` parameter is one of:

| Status | Meaning |
|--------|---------|
| `queued` | Call created but not yet dialed |
| `ringing` | The call is ringing |
| `in-progress` | The call is connected |
| `completed` | The call ended normally |
| `busy` | The dialed number was busy |
| `failed` | The call could not complete |
| `no-answer` | The call rang but was not answered |
| `canceled` | The call was canceled via the REST API |

## Incoming SMS Payload Fields

Sent as form-encoded parameters:

```
MessageSid=SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AccountSid=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
From=+14155552671
To=+14155552672
Body=Hello!
NumMedia=0
NumSegments=1
FromCity=SAN+FRANCISCO
FromState=CA
FromCountry=US
```

MMS messages add `MediaUrl0`, `MediaContentType0`, etc., up to `NumMedia`.

## Headers Included with Every Webhook

| Header | Description |
|--------|-------------|
| `X-Twilio-Signature` | Base64-encoded HMAC-SHA1 signature used to verify the request |
| `I-Twilio-Idempotency-Token` | Unique delivery identifier (useful for idempotency) |
| `Content-Type` | Usually `application/x-www-form-urlencoded`; `application/json` if you opted into JSON |
| `User-Agent` | Starts with `TwilioProxy/` |

## Full Event Reference

- [Messaging webhooks (incoming SMS)](https://www.twilio.com/docs/messaging/guides/webhook-request)
- [Message status callbacks](https://www.twilio.com/docs/messaging/guides/track-outbound-message-status)
- [Voice TwiML](https://www.twilio.com/docs/voice/twiml)
- [Webhooks overview](https://www.twilio.com/docs/usage/webhooks)
