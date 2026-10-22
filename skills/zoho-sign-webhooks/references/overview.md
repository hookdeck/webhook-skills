# Zoho Sign Webhooks Overview

## What Are Zoho Sign Webhooks?

Zoho Sign calls a URL you register whenever something happens to a signature request
(sent, viewed, signed, completed and so on). Webhooks are available on Enterprise, API,
Zoho One and People Plus plans, and an account can have two webhooks.

## What Event Types Does Zoho Sign Send?

The event type is `notifications.operation_type`. The request has no event header.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `RequestSubmitted` | Document submitted for signature | Track outbound requests |
| `RequestViewed` | Submitted document viewed | Reminders, engagement tracking |
| `RequestSigningSuccess` | One signer completes signing | Per-signer progress |
| `RequestCompleted` | All signers/approvers done | Download signed PDF, update CRM |
| `RequestRejected` | Request rejected by a signer | Alert the sender |
| `RequestRecalled` | Sender recalls the request | Cancel downstream work |
| `RequestForwarded` | Signer forwards to another person | Update recipient records |
| `RequestExpired` | Signing time expires | Resend or close out |

For signer actions (`RequestViewed`, `RequestSigningSuccess`, `RequestRejected`,
`RequestForwarded`) `notifications.action_id` identifies the signer's action.

## Event Payload Structure

```json
{
  "notifications": {
    "performed_by_email": "testuser@zoho.com",
    "performed_at": 1555062604837,
    "reason": "reason given if any",
    "activity": "Document has been signed",
    "operation_type": "RequestSigningSuccess",
    "action_id": "1000000000090",
    "performed_by_name": "test user",
    "ip_address": "192.168.100.100"
  },
  "requests": {
    "request_name": "NDA Document",
    "request_id": "1000000000000",
    "org_id": "9876543210",
    "request_type_id": "10000000011",
    "document_ids": [
      { "document_name": "CommonNDA.pdf", "document_id": "100000000000050" }
    ]
  }
}
```

`performed_at` is epoch milliseconds. Zoho notes that attributes other than the documented
ones may be removed in the future, so rely only on documented fields. There is no event ID,
so build an idempotency key from `request_id`, `operation_type`, `action_id` and `performed_at`.

## Full Event Reference

See [Zoho Sign webhooks](https://help.zoho.com/portal/en/kb/zoho-sign/admin-guide/articles/webhooks-management).
