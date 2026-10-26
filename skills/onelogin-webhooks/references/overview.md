# OneLogin Webhooks Overview

## What Are OneLogin Webhooks?

The OneLogin Event Webhook API, also called the **Event Broadcaster**, sends batches of events in near real time to an endpoint you specify. It is a firehose: every event type on the account is sent, so you filter on `event_type_id`. Typical uses are streaming into a SIEM or logging system, or reacting to specific events such as a high-risk login.

There is no API for creating the subscription; you create it under **Developers > Webhooks** in the OneLogin admin portal. OneLogin recommends the **JSON Array** format.

## Common Event Types

| `event_type_id` | Event | Common Use Cases |
|-----------------|-------|------------------|
| `5` | User Login Success | Audit trail, flag risky logins (`risk_score`) |
| `6` | User Login Failed | Brute-force detection, alerting |
| `7` | User Logout | End the matching session in your app |
| `8` | User Logged into an App | Record app access |
| `11` | User Changed Password | Revoke sessions, notify the user |
| `22` | User Added an MFA Device | Audit new factors |

The complete list of event types is available from the Event Types API. Unknown IDs should be acknowledged with `200`.

## Event Payload Structure

A request body is an array of event objects:

```json
[
  {
    "event_type_id": 5,
    "uuid": "d210df80-ede8-42ba-8199-00ce951bc222",
    "account_id": 92920,
    "user_id": 32916209,
    "user_name": "John Richards",
    "ipaddr": "125.236.219.21",
    "event_timestamp": "2017-12-05 19:13:06 UTC",
    "notes": "Authentication method: password.",
    "app_name": null,
    "risk_score": null
  }
]
```

Each event carries many more fields (most are `null` unless relevant to the event type): `login_name`, `app_id`, `actor_user_id`, `actor_user_name`, `role_name`, `group_name`, `otp_device_name`, `user_agent`, `error_description` and so on. The example above is trimmed.

OneLogin's docs recommend the JSON Array format type and describe no other, so configure the broadcaster with it.

## Delivery

Return HTTP `200` on success. A non-200 response or a timeout causes the same payload to be sent again, for a maximum of 3 attempts. There is no signature and no delivery ID header; use each event's `uuid` for idempotency.

## Full Event Reference

See [OneLogin's webhook documentation](https://developers.onelogin.com/api-docs/1/events/webhooks/) and the [Event Types API](https://developers.onelogin.com/api-docs/1/events/event-resource).
