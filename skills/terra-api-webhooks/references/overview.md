# Terra API Webhooks Overview

## What Are Terra API Webhooks?

Terra (tryterra.co) is a wearables and health-data API. A **webhook destination** receives two kinds of deliveries for your connected users: authentication lifecycle events (a user connected, disconnected or hit an error) and normalised health data (activity, sleep, body, daily, ...). Every delivery is a `POST` with a JSON body and an `X-Terra-Signature` header. Lab Reports results (`lab_report.completed`, `lab_report.failed`) go to the same destinations.

## Common Event Types

The event type is the top-level `type` field of the body; every documented payload starts with it, and `status` (`success`, `warning`, `error`, ...) qualifies it on most types.

| Event (`type`) | Triggered When | Common Use Cases |
|----------------|----------------|------------------|
| `auth` | A user connects a provider (check `status`) | Store the Terra `user_id`, mark the connection live |
| `deauth` | A user disconnects | Stop syncing, clean up |
| `user_reauth` | A user re-authenticates and gets a new user ID | Remap the stored user ID |
| `access_revoked` | The user revoked access at the provider | Ask the user to reconnect |
| `connection_error` | A provider connection fails | Alert, prompt reconnection |
| `activity` | New workout data | Training logs |
| `sleep` | New sleep data | Recovery dashboards |
| `body` | New body metrics | Health trends |
| `daily` | New daily summary | Daily dashboards |
| `athlete` | Profile data | Keep profile fields in sync |

The other documented types are `auth_cancelled`, `permission_change`, `google_no_datasource`, `large_request_sending`, `large_request_processing`, `rate_limit_hit`, further data types (`hormone`, `menstruation`, `nutrition`, `clinical_record`), `lab_report.completed`, `lab_report.failed` and `healthcheck`. `processing` is an HTTP response only and is never sent to a destination. The examples log anything they don't handle and return `200`.

In ping mode a data delivery carries `"type": "s3_payload"` and a download URL rather than the data itself.

## Event Payload Structure

Most bodies carry `type`, `status` and a `user` object (`user_id`, `provider`, `reference_id`, ...). Data events add `version` and a `data` array of normalised records, except `athlete`, which carries one `athlete` object. `user_reauth` has `new_user` and `old_user`. Lab report deliveries are an envelope of `type`, `event_id`, `occurred_at`, `upload_id` and `data`. Terra's [API reference](https://docs.tryterra.co/reference/health-and-fitness-api/webhooks) has a complete example for each type.

## Delivery and Retries

- A `2xx` within **8 seconds** counts as success.
- Otherwise (any other status, a `3xx` included, a timeout or an unreachable URL) Terra retries with exponential backoff for **several hours**. Terra says the number and timing of retries can change.
- When retries run out the delivery becomes `failed` and Terra doesn't notify you. Resend failed events from the dashboard Events page or with `terra events resend`.
- A per-destination circuit breaker holds **data** events (not auth events) during sustained failure. Held cycles count toward the retry limit.
- Deliveries are at least once and order isn't guaranteed: upsert on Terra's record keys and compare the `x-terra-ordering-timestamp` header.

Acknowledge quickly and process asynchronously. Running behind the Hookdeck Event Gateway gives you queuing, replay and alerting so nothing is dropped silently.

## Full Event Reference

For the complete list of events, see [Terra's event types](https://docs.tryterra.co/reference/health-and-fitness-api/event-types).
