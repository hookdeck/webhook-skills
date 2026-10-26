# 8x8 Webhooks Overview

## What Are 8x8 Webhooks?

8x8 Connect (CPaaS) POSTs JSON to a URL you configure whenever something happens on your
account: an inbound SMS or Chat Apps message, a delivery receipt, a short URL click, or a
WhatsApp/Viber template update. Webhooks are created per sub-account and API type in the
8x8 Connect portal or with the Webhooks Configuration API.

Payloads are not signed. The only authentication is an optional static HTTP Authorization
value sent as the `Authorization` header (see [verification.md](verification.md)).

## What Event Types Does 8x8 Send?

Every body has an `eventType` string. SMS and Chat Apps events also carry `namespace`
(`SMS` or `ChatApps`), `description` and a `payload` object.

| `eventType` | Namespace | Triggered When |
|-------------|-----------|----------------|
| `inbound_message_received` | `SMS`, `ChatApps` | A user sends a message to your virtual number or WhatsApp number |
| `outbound_message_status_changed` | `SMS`, `ChatApps` | A delivery receipt: `payload.status.state` changes |
| `external_app_message` | `ChatApps` | A message is sent from the WhatsApp Business App (DR v9) |
| `short_url_clicked` | `SMS` | A recipient clicks a shortened URL in your SMS |
| `template_status_update` | (provider event) | A WhatsApp or Viber template changes status |
| `template_category_update` | (provider event) | A WhatsApp template's category changes |
| `template_quality_update` | (provider event) | A WhatsApp template's quality score changes |
| `template_correct_category_detection` | (provider event) | WhatsApp detects a more correct template category |
| `phone_number_quality_update` | (provider event) | A WhatsApp phone number's quality changes |
| `account_update` | (provider event) | Your WhatsApp Business Account (WABA) changes; `eventDetails.event` refines it (e.g. `ACCOUNT_VIOLATION`, `BUSINESS_VERIFICATION_STATUS_UPDATE`) |
| `whatsapp_automatic_events` | (provider event) | Meta detects a purchase or lead conversion in a WhatsApp thread from a Click-to-WhatsApp ad; Meta's payload is in `eventDetails.rawEvent` |

## Payload Structure

### Inbound SMS

```json
{
  "namespace": "SMS",
  "eventType": "inbound_message_received",
  "description": "SMS inbound message",
  "payload": {
    "umid": "9e09ac86-bd74-5465-851d-1eb5a5fdbb9a",
    "subAccountId": "SubAccount-1",
    "timestamp": "2016-01-01T14:34:56.017Z",
    "source": "+6581968289",
    "destination": "+4534735477",
    "body": "Test MO message",
    "encoding": "GSM7",
    "smsCount": 2
  }
}
```

### Delivery receipt

`payload.status.state` is one of `queued`, `rejected`, `sent`, `delivered`, `undelivered`,
`read`. `status.detail` (`delivered_to_operator`, `delivered_to_recipient`,
`rejected_by_operator`, `undelivered_to_recipient`), `errorCode` and `errorMessage` are
optional.

```json
{
  "namespace": "SMS",
  "eventType": "outbound_message_status_changed",
  "description": "SMS outbound message delivery receipt",
  "payload": {
    "umid": "9e09ac86-bd74-5465-851d-1eb5a5fdbb9a",
    "clientMessageId": "1e09ac86-bd74-5465-851d-1eb5a5fdbb9b",
    "subAccountId": "SubAccount-1",
    "source": "8x8",
    "destination": "+12025550293",
    "status": { "state": "undelivered", "detail": "rejected_by_operator", "timestamp": "2016-01-01T00:00:00Z", "errorCode": 15, "errorMessage": "Invalid destination" },
    "smsCount": 3
  }
}
```

### Short URL click

```json
{
  "namespace": "SMS",
  "eventType": "short_url_clicked",
  "description": "Short URL from SMS clicked",
  "payload": {
    "eventId": "0f6a0c0f-8b67-4a3a-a6c3-7b0ecf0d2b1a",
    "occurredAt": "2025-10-03T12:00:00Z",
    "umid": "9e09ac86-bd74-5465-851d-1eb5a5fdbb9a",
    "destination": "+12025550293",
    "shortUrl": "https://2g.to/abc123/abc",
    "targetUrl": "https://example.com/landing?c=fall_campaign"
  }
}
```

### Template and business management events

These have no `namespace`/`payload` envelope. Fields: `eventId`, `timestamp`, `provider`
(`WhatsApp` or `viber`), `businessAccountId`, `accountId`, `eventType`, `eventDetails`
(`templateId`, `templateName`, `templateLanguage`, `meta`). For `template_status_update` on
WhatsApp, `meta.status` is `APPROVED`, `REJECTED`, `FLAGGED`, `PAUSED` or `PENDING_DELETION`;
for Viber, `viber.status` is `PENDING`, `APPROVED` or `REJECTED`.

## Retries

On a connection error, timeout or a 4xx/5xx response, 8x8 retries after 1, 10, 30 and 90
seconds. Make handlers idempotent: dedupe SMS events on `payload.umid` plus
`payload.status.state`, and template events on `eventId`.

## Full Reference

- Developer tools (webhooks page): https://developer.8x8.com/connect/docs/developer-tools
- Inbound SMS: https://developer.8x8.com/connect/docs/inbound-sms
- SMS delivery receipts: https://developer.8x8.com/connect/docs/delivery-receipts-for-outbound-sms
- Short URL clicks: https://developer.8x8.com/connect/docs/short-url-clicks
- Chat Apps delivery receipts: https://developer.8x8.com/connect/docs/delivery-receipts-for-outbound-chatapps
- WhatsApp template changes: https://developer.8x8.com/connect/docs/whatsapp-template-change-webhook
