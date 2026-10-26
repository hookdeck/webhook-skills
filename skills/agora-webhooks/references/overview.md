# Agora Webhooks Overview

## What Are Agora Webhooks?

Agora Notifications (NCS) posts events to an HTTPS URL configured per project in Agora Console. RTC events cover channels being created and destroyed, users joining and leaving, and role changes. The same envelope serves other products (`productId` 3 = Cloud Recording, 4 = Media Pull, 5 = Media Push), whose event codes are documented on their own pages.

## Common Event Types

Dispatch on the numeric `eventType` field with `productId` `1` (RTC). The event name is not on the wire.

| `eventType` | Meaning | Handled in the examples |
|-------------|---------|-------------------------|
| `101` | Channel create | Yes |
| `102` | Channel destroy | Yes |
| `103` | Broadcaster joins channel | Yes |
| `104` | Broadcaster leaves channel | Yes |
| `105`, `106`, `107`, `108`, `111`, `112` | Other documented RTC codes | Logged only |

## Event Payload Structure

```json
{
  "noticeId": "2000001428:4330:107",
  "productId": 1,
  "eventType": 101,
  "notifyMs": 1611566412672,
  "sid": "1FB4F1BE1D1B4C5C8A0E4E0D3B6C1B7A",
  "payload": { "channelName": "test_webhook", "ts": 1611566412, "uid": 1234, "clientSeq": 1 }
}
```

## Delivery

- Respond `200` with a JSON body within 10 seconds.
- Otherwise Agora resends immediately, then at growing intervals, at most three retries.
- Duplicates and out-of-order deliveries happen by design: dedupe on `noticeId` and order by `clientSeq`/`ts` where it matters.

## Full Event Reference

See [Agora's notification documentation](https://docs.agora.io/en/video-calling/advanced-features/receive-notifications).
