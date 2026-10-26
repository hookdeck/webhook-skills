# SMTP2GO Webhooks Overview

## What Are SMTP2GO Webhooks?

Webhooks let SMTP2GO notify your web service with an HTTP or HTTPS POST whenever an email or SMS event happens in your account, for example a bounce, an open or a spam complaint. They can be set for selected SMTP users, API keys or authenticated IPs. Free plans get 1 webhook; paid plans up to 10.

Payloads are not signed and carry no timestamp signature. See [verification.md](verification.md).

## Common Event Types

### Email (`event` field)

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `processed` | SMTP2GO received the email and is processing it for delivery | Track queueing |
| `delivered` | The recipient server confirmed delivery (250 response) | Mark a message delivered |
| `open` | The recipient opened the email (can fire repeatedly) | Engagement analytics |
| `click` | The recipient clicked a tracked link (can fire repeatedly) | Link analytics |
| `bounce` | The recipient server bounced the message (`bounce` = `hard` or `soft`) | Suppress hard-bounced addresses |
| `spam` | The recipient marked the email as spam | Remove from lists |
| `unsubscribe` | The recipient used the unsubscribe footer | Update preferences |
| `resubscribe` | The recipient resubscribed or was removed from Suppressions | Re-enable sending |
| `reject` | The email was rejected (suppressed address, unverified sender or sandboxed sender) | Fix sender or list |

### SMS (`event` field)

| Event | Triggered When |
|-------|----------------|
| `sms_sending` | The SMS is being processed |
| `sms_submitted` | Submitted to the downstream provider, delivery unconfirmed |
| `sms_delivered` | Delivery confirmed by the downstream provider |
| `sms_failed` | Delivery failed (validation, gateway failure, dropped, duplicate) |
| `sms_rejected` | Blocked by the SMS network |

The docs also list an "Opt-Out" SMS event, but their parameter list does not name its `event` string; check a captured delivery before matching on it.

## Event Payload Structure

Parameters are flat (JSON object or form fields). Email events:

| Field | Description |
|-------|-------------|
| `event` | What happened (see above) |
| `time` / `sendtime` | UTC time of the event / of sending to SMTP2GO |
| `sender` / `from` / `from_address` / `from_name` | Envelope-from and From details |
| `rcpt` / `recipients` | Addressed email / all recipients |
| `email_id` | Unique id of the email, for retrieving details |
| `id` | Unique id for the webhook |
| `message-id` | The sender's message id |
| `subject`, `auth`, `host`, `message`, `context` | Subject, sending credential (API keys truncated), bouncing host, error text, extra context |
| `bounce` | `hard` or `soft` (bounce events) |
| `user-agent`, `read-secs`, `client`, `client-device`, `client-os`, `geoip-*`, `srchost` | Open/click details where available |

SMS events: `event`, `destination_number`, `source_number`, `message_id`, `message_content`, `status_code`, `region`, `retry_count`, `sender_email`, `email_subject`, `received_timestamp`, `submitted_timestamp`, `id`.

Custom email headers you choose in the webhook's settings arrive as extra fields.

## Delivery and Retries

- Body is JSON or form encoded, depending on the webhook's output type
- Failures retry for up to 48 hours, a maximum of 35 times: 5 in the first 30 minutes, hourly for 24 hours, every 6 hours, every 12 hours, then a final attempt
- The timeout is 10 seconds (no response headers in that time)
- Failed notifications can be viewed and retried in the app under Settings > Webhooks > Failed Notifications
- Webhook delivery IPs resolve from the A record for `webhooks.smtp2go.com`

## Full Event Reference

See [SMTP2GO's webhooks overview](https://developers.smtp2go.com/docs/webhooks-overview).
