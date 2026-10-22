# tawk.to Webhooks Overview

## What Are tawk.to Webhooks?

tawk.to (live chat and ticketing) sends real-time notifications of events to an external URL. Each webhook has a URL, one or more events, and a secret key used to verify that a payload came from tawk.to. When an event fires, tawk.to makes a `POST` with a JSON body specific to the event type.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `chat:start` | First message in a chat is sent by a visitor or agent (not whispers or system messages like triggers) | Alert a channel, create a CRM record |
| `chat:end` | A chat has ended | Close out tracking, trigger follow-ups |
| `chat:transcript_created` | Full transcript of the chat session is generated after it ends | Archive transcripts, sentiment analysis |
| `ticket:create` | A new ticket is created | Sync to a helpdesk, notify support |

## Event Payload Structure

Every payload has `event` (the event name), `time` (ISO 8601), and a `property` object (`id`, `name`).

- `chat:start`: `chatId`, `domain`, `referrer`, `message` (`text`, `type` of `msg`/`file`/`webrtc-call`, `sender.type` of `agent`/`visitor`/`system`), `visitor` (`name`, `email`, `city`, `country`)
- `chat:end`: `chatId`, `domain`, `referrer`, `visitor`
- `chat:transcript_created`: `domain`, `referrer`, `chat` (`id`, `visitor`, `messages[]` with `sender.t` of `a`/`v`/`s`, `sender.n`, `type`, `msg`, `time`, `attchs`)
- `ticket:create`: `requester` (`name`, `email`), `ticket` (`id`, `humanId`, `subject`, `message`)

```json
{
  "event": "chat:start",
  "chatId": "70fe3290-99ad-11e9-a30a-51567162179f",
  "time": "2019-06-28T14:03:04.646Z",
  "domain": "tawk.to",
  "message": { "text": "Sample message", "type": "msg", "sender": { "type": "visitor" } },
  "visitor": { "name": "V1561719148780935", "email": "hello@test.com", "city": "jelgava", "country": "LV" },
  "property": { "id": "58ca8453b8a7e060cd3b1ecb", "name": "Bobs Burgers" }
}
```

## Delivery and Retries

- Headers: `X-Tawk-Signature` (signature), `X-Hook-Event-Id` (stable across retries)
- Any non-2XX response, or no response within 30 seconds, is retried for up to 12 hours

## Full Event Reference

See [tawk.to webhook documentation](https://developer.tawk.to/webhooks/).
