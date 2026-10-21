# Cloudflare Webhooks Overview

## What Are Cloudflare Webhooks?

Cloudflare Notifications (shown as **Alerts** in the dashboard) sends alerts to
destinations: email, PagerDuty, and webhooks. A **generic webhook** posts a JSON
payload to any HTTPS URL when a notification policy fires. Webhooks are
available on all plans.

These are not Cloudflare Workers. Workers can sit in front of a generic webhook
to transform it, but the webhook itself is a Notifications feature.

Cloudflare doesn't sign the payload. The **Secret** you set on the webhook is
sent verbatim in the `cf-webhook-auth` header. See
[verification.md](verification.md).

## Common Event Types

The event name is the payload's `alert_type`. Values documented in Cloudflare's
webhook payload schema:

| `alert_type` | Triggered When | Common Use Cases |
|---|---|---|
| `advanced_ddos_attack_l4_alert` | A Layer 3/4 DDoS attack is detected | Page on-call, open an incident |
| `advanced_ddos_attack_l7_alert` | A Layer 7 DDoS attack is detected | Page on-call, tighten rules |
| `dedicated_ssl_certificate_event_type` | Dedicated or custom SSL certificate event, such as expiry | Renew certificates |
| `health_check_status_notification` | An origin health check changes status | Failover, status page updates |
| `workers_alert` | A Workers usage alert fires | Cost and usage monitoring |
| `workers_observability_alert` | A Workers observability alert fires | Error monitoring |
| `access_custom_certificate_expiration_type` | An Access custom certificate is near expiry | Rotate certificates |

Cloudflare offers many more notification types. They use the same envelope with
their own `alert_type`, and the handler should treat unknown values as
"log and acknowledge". Don't hard-fail on them.

The dashboard's **Save and Test** button sends a message with only a `text`
field and **no `alert_type`**:

```json
{
  "text": "Hello World! This is a test message sent from https://cloudflare.com. If you can see this, your webhook is configured properly."
}
```

The examples map that to the event name `test`.

## Event Payload Structure

```json
{
  "name": "Example Cloudflare Notification",
  "text": "The description of my Cloudflare notification.",
  "data": {},
  "ts": 1136214245,
  "account_id": "9035f53656c247e895c5a6939ae8a0e0",
  "policy_id": "749b911ea5d04344a58e45edd099b328",
  "policy_name": "Example Cloudflare Notification",
  "alert_type": "health_check_status_notification",
  "alert_correlation_id": "000eaa907ed24e78946d3a93adb2ae57",
  "alert_event": "ALERT_STATE_EVENT_START"
}
```

| Field | Type | Description |
|---|---|---|
| `name` | string | Name of the notification policy |
| `text` | string | Human-readable description with interpolated values |
| `data` | object | Alert-specific data; the shape varies by `alert_type` |
| `ts` | integer | Unix timestamp (seconds, UTC) when the notification was generated |
| `account_id` | string | Account the webhook fired for |
| `policy_id` | string | UUID of the notification policy |
| `policy_name` | string | Name of the notification policy |
| `alert_type` | string | Unique identifier of the alert type |
| `alert_correlation_id` | string | UUID grouping related alerts |
| `alert_event` | string | Event state, e.g. `ALERT_STATE_EVENT_START` or `ALERT_STATE_EVENT_END` |

`account_id`, `policy_id` and `alert_type` may be missing depending on the alert
type and context, so read them defensively.

### `data` examples

- `health_check_status_notification`: `health_check_name`, `old_status`, `new_status`, `origin_ip`, `reason`, `zone_name`
- `advanced_ddos_attack_l7_alert`: `attack_id`, `attack_type`, `target_hostname`, `requests_per_second`, `mitigation`, `start_time`
- `advanced_ddos_attack_l4_alert`: `attack_id`, `attack_vector`, `target_ip`, `target_port`, `packets_per_second`, `megabits_per_second`
- `access_custom_certificate_expiration_type`: `certificate_id`, `days_til_expiration`, `hostnames`, `zone_name`

## Full Event Reference

- [Configure webhooks](https://developers.cloudflare.com/notifications/get-started/configure-webhooks/)
- [Webhook payload schema](https://developers.cloudflare.com/notifications/reference/webhook-payload-schema/)
- [Available notifications](https://developers.cloudflare.com/notifications/notification-available/)
