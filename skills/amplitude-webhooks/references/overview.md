# Amplitude Webhooks Overview

## What Are Amplitude Webhooks?

Amplitude's **Webhook: Events · User Properties** destination (Data > Catalog > Destinations)
forwards events and users to a URL you choose as Amplitude ingests them. It is available on the
Plus, Growth and Enterprise plans. It does not send on a schedule or on demand, and it does not
support transformed events.

Every request has two preset headers:

- `Content-Type: application/json`
- `User-Agent: Amplitude/Webhook/1.0`

You can add up to five more headers. Requests are **not signed**: there is no signature and no
timestamp header. Authenticate with a secret header you add yourself (see
[verification.md](verification.md)).

Amplitude has no single source IP address, so don't rely on an IP allowlist.

## What Gets Sent?

There is no fixed catalogue of webhook event names. What you receive depends on what you enable:

| Payload | Sent When | Default format |
|---------|-----------|----------------|
| Forwarded event | Amplitude ingests an event that matches your **Select and filter events** choice | Amplitude [event format](https://amplitude.com/docs/apis/analytics/export) |
| User properties update | Amplitude receives an event, or an [Identify API](https://amplitude.com/docs/apis/analytics/identify) call, for a user | Amplitude [user format](https://amplitude.com/docs/apis/analytics/identify) |

## Event Payload Structure

In a forwarded event, `event_type` is the name of **your own** event (for example
`Button Clicked`), not an Amplitude-defined type. Other common fields from the event format:

| Field | Meaning |
|-------|---------|
| `event_type` | Your event name |
| `user_id`, `device_id`, `amplitude_id` | Who it happened to |
| `event_time` | UTC timestamp, for example `2022-02-28 20:07:01.795` |
| `event_properties` | Properties of the event |
| `user_properties` | Properties of the user |
| `uuid`, `$insert_id` | Identifiers usable for deduplication |

User updates follow the user format: `user_id` and/or `device_id` (depending on how Identify was
called, `user_id` may be absent) plus `user_properties`.

## Custom Payloads (FreeMarker)

Instead of the default, you can write an [Apache FreeMarker](https://freemarker.apache.org/)
template that turns an event or user (`input`) into any JSON your endpoint expects. A template
changes the payload shape, so adapt the handler's dispatch accordingly. The example handlers use
the default format.

## Retries

Amplitude tries each event or user once, then makes nine more attempts over 4 hours on failure,
regardless of the error. Within each attempt it also retries 5xx and 429 responses up to 3 times
with exponential backoff (100 ms initial, doubling, 50% jitter), giving up after 4 seconds. Make
the handler idempotent (for example key on `uuid` or `$insert_id`) and return `2xx` quickly.

## Full Reference

See [Amplitude's Webhooks Streaming documentation](https://amplitude.com/docs/data/destination-catalog/webhooks).
