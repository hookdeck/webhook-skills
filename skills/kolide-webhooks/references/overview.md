# 1Password Device Trust (Kolide) Webhooks Overview

## What Are Kolide Webhooks?

1Password Device Trust (formerly Kolide, kolide.com) checks device compliance and gates SSO. Admins with Full Access register webhook endpoints in the admin console (Settings > Developers > Webhooks). Kolide then sends an HTTP POST with a JSON body to each endpoint when a subscribed event happens. Delivery logs are kept for six months. Retry behavior, the delivery timeout, and the accepted success codes are not documented, so treat delivery as at-least-once: return `200` quickly and dedupe on the event `id`.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `devices.created` | A device is created | Inventory sync |
| `devices.registered` | A device is registered to an owner | Assign ownership in your CMDB |
| `devices.destroyed` | A device is deleted | Remove from inventory |
| `device_trust.status_changed` | A device's trust status changes | Revoke access when `device_status` is `blocked` |
| `issues.new` | A check finds a new issue on a device | Open a ticket, notify the owner |
| `issues.resolved` | An issue is resolved | Close the ticket |
| `auth_logs.success` | A device-trust authentication succeeded | Audit trail |
| `auth_logs.failure` | A device-trust authentication failed | Alert on blocked sign-ins |
| `audit_log.recorded` | An admin action is recorded | Ship to a SIEM |
| `admin_users.created` | An admin user is created | Alert on new admins |
| `requests.registration` | An end user requests device registration | Approval workflow |
| `requests.issue_exemption` | An end user requests an issue exemption | Approval workflow |
| `webhook.test` | You send the test event from the admin console | Confirm delivery and verification |

These are the 13 documented event types. Handle the ones you need and log the rest.

## Event Payload Structure

Every event shares the same envelope. The top-level `event` field names the event type (lower-case form of its section heading in the docs):

```json
{
  "event": "devices.created",
  "id": "01HDVY8MA3CQ48HJ356FP8M2P6",
  "timestamp": "2023-10-28T20:05:33Z",
  "data": { "device_id": 1, "device_name": "Jasons-MacBook-Pro" }
}
```

`device_trust.status_changed` data:

```json
{ "device_id": 9, "device_name": "Matts-Kolide-MacBook-Pro", "device_status": "blocked", "device_url": "https://api.kolide.com/devices/9" }
```

`issues.new` data carries nested `device` and `check` objects:

```json
{
  "issue_id": 2, "title": null, "check_id": 71,
  "device": { "id": 1, "name": "Jasons-MacBook-Pro-2" },
  "check": { "id": 71, "name": "macOS Firewall - Require macOS Firewall is Enabled", "tags": [] }
}
```

`webhook.test` data is `{ "message": "This is a test webhook event" }`. Treat every field as untrusted after verification: check types before reading into nested objects (`title` can be `null`).

## Full Event Reference

For the complete list of events and payloads, see [1Password Device Trust webhooks](https://support.1password.com/device-trust-webhooks/).
