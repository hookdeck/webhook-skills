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
| `105` | Audience member joins channel (streaming profile) | Logged only |
| `106` | Audience member leaves channel (streaming profile) | Logged only |
| `107` | User joins channel (communication profile) | Logged only |
| `108` | User leaves channel (communication profile) | Logged only |
| `111` | Audience member switches to host | Logged only |
| `112` | Host switches to audience member | Logged only |

## Event Payload Structure

Agora's envelope example, with `payload` elided as in the docs:

```json
{
  "noticeId":"2000001428:4330:107",
  "productId":1,
  "eventType":101,
  "notifyMs":1611566412672,
  "payload":{
     ...
  }
}
```

Agora's example `payload` for `103` (broadcaster join channel):

```json
{
  "channelName":"test_webhook",
  "uid":12121212,
  "platform":1,
  "clientSeq":1625051030746,
  "ts":1560396843
}
```

`notifyMs` is updated each time Agora resends a callback. Every event except `101` and `102` carries `payload.clientSeq`.

## Delivery

- Respond `200` with a JSON body within 10 seconds.
- Otherwise Agora resends immediately, then at growing intervals, at most three retries.
- Duplicates and out-of-order deliveries happen by design. Agora's docs say to keep the last `clientSeq` per user and ignore a callback with a lower one, and to wait a minute after a leave event before deleting the user's data. They don't say whether `noticeId` stays the same on a resend.

## Full Event Reference

See [Agora's notification documentation](https://docs.agora.io/en/realtime-media/rtc/build/optimize-and-operate/receive-notifications).
