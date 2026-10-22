# Iterable Webhooks Overview

## What Are Iterable Webhooks?

An Iterable **system webhook** sends a JSON `POST` to your endpoint whenever a selected
event occurs anywhere in an Iterable project (not tied to one template, campaign or journey;
use a journey webhook for that). Payloads are not signed. The only authentication is the
optional `Authorization` header (see [verification.md](verification.md)).

## What Event Types Does Iterable Send?

`eventName` values, exactly as listed in Iterable's documentation (case-sensitive):

| Channel | `eventName` values |
|---------|--------------------|
| Email | `emailSend` (blast and triggered), `emailOpen`, `emailClick`, `emailBounce`, `emailComplaint`, `emailSendSkip`, `emailSubscribe`, `emailUnSubscribe`, `hostedUnsubscribeClick` |
| Embedded | `embeddedClick`, `embeddedImpression`, `embeddedReceived`, `embeddedSession` |
| In-app | `inAppClick`, `inAppClose`, `inAppDelete`, `inAppDelivery`, `inAppOpen`, `inAppRecall`, `inAppSend`, `inAppSendSkip` |
| Push | `pushSend`, `pushOpen`, `pushBounce`, `pushUninstall`, `pushSendSkip` |
| RCS | `rcsSend`, `rcsSendSkip`, `rcsBounce`, `rcsSeen`, `rcsClick` |
| SMS | `smsSend`, `smsClick`, `smsReceived`, `smsBounce`, `smsSendSkip` |
| Web push | `webPushSend`, `webPushClick`, `webPushSendSkip` |
| WhatsApp | `whatsAppSend`, `whatsAppReceived`, `whatsAppBounce`, `whatsAppSeen`, `whatsAppClick`, `whatsAppSendSkip` |
| Other | `anonSession`, `unknownSession`, `journeyExit` |

Note the capital S in `emailUnSubscribe` (the other event names have no such quirk).
`emailSubscribe` and `emailUnSubscribe` are universal to all channels. They can fire in large
numbers on list updates; the **Exclude List Update Events** setting limits them to
user-initiated changes.

## Event Payload Structure

```json
{
  "email": "user@example.com",
  "eventName": "emailSend",
  "dataFields": {
    "createdAt": "2016-12-02 20:21:04 +00:00",
    "campaignId": 59667,
    "templateId": 93849,
    "messageId": "9c438a20d26e4e9f8ad4edea23f811cd",
    "emailSubject": "My subject"
  }
}
```

- `email` or `userId`: the user (hybrid projects may send both)
- `eventName`: the event that triggered the webhook
- `dataFields`: event-specific fields; they vary by event, webhook settings and project

Iterable's example payloads are not exhaustive schemas and new fields can appear without
notice, so tolerate unknown fields and confirm real shapes by testing with real data.

## Delivery Behavior

- Timeout is 2 seconds; a slow response counts as failed and may be retried.
- Up to 3 retries (4 attempts), with increasing delays over a few minutes, only for
  `429`, `502`, `503` and `504`. All other 4xx/5xx responses (including `401`) are not
  retried. DNS, connection and TLS failures are not retried.
- Delivery and order are not guaranteed; duplicates are possible. Iterable suggests
  deduplicating on the event timestamp (`dataFields.createdAt`).
- If an endpoint fails at 90% or more with at least 500 errors in 10 seconds, Iterable pauses
  delivery for 60 seconds.
- System webhooks are not a definitive data export; use Data Sync or the Export APIs for that.

## Full Event Reference

https://support.iterable.com/hc/en-us/articles/208013936-System-Webhooks
