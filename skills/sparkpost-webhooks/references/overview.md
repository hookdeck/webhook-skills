# SparkPost Webhooks Overview

## What Are SparkPost Event Webhooks?

SparkPost (sparkpost.com, API at `https://api.sparkpost.com/api/v1`, EU region
`https://api.eu.sparkpost.com/api/v1`) pushes raw email event data to your server. From the
API reference: *"Webhooks allow us to push raw events we collect about your emails over to
your servers. Batches of events are delivered through a POST request to the defined target
URL."*

Two distinct things are called "webhooks" at SparkPost:

| API | Purpose | Payload wrapper |
|-----|---------|-----------------|
| **Event webhooks** — `/api/v1/webhooks` | Outbound email **event stream** (delivery, bounce, click, …) | `msys.message_event`, `msys.track_event`, … |
| **Relay webhooks** — `/api/v1/relay-webhooks` | **Inbound email** content relayed to your app | `msys.relay_message` |

This skill covers **event webhooks**; relay webhooks are summarised at the bottom.

SparkPost is now owned by Bird (formerly MessageBird). **Bird's new platform webhooks**
(bird.com) are a different product with their own Standard Webhooks signing and
`email.delivered`-style event names — none of that applies to SparkPost event webhooks.
SparkPost Momentum / on-prem "Momentum webhooks" and legacy MessageBird
Conversations/SMS webhooks are also out of scope.

## Payload Structure: A Batch Array

The request body is a **JSON array** (a batch). Each element is an object with a single
`msys` key, which wraps exactly **one event-class object**, which in turn carries a `type`
field naming the event:

```json
[
  {
    "msys": {
      "message_event": {
        "type": "delivery",
        "event_id": "92356927693813856",
        "timestamp": "1460989507",
        "message_id": "000443ee14578172be22",
        "transmission_id": "65832150921904138",
        "rcpt_to": "recipient@example.com",
        "campaign_id": "Example Campaign Name",
        "subaccount_id": "101"
      }
    }
  },
  {
    "msys": {
      "track_event": {
        "type": "click",
        "event_id": "92356927693813856",
        "target_link_url": "http://example.com"
      }
    }
  }
]
```

Batches *"may vary from 1 to 350 or more events based on your volume and peak sending rate"*
and **can mix event classes in one batch**. Always:

1. Iterate the array.
2. Read the **single key** under `msys` — do not hardcode `message_event`.
3. Switch on the inner object's `type`.

## All Event Types by Wrapper Key

| Wrapper key | Event `type` values |
|-------------|---------------------|
| `message_event` | `bounce`, `delivery`, `injection`, `spam_complaint`, `out_of_band`, `policy_rejection`, `delay`, `sms_status` |
| `track_event` | `click`, `open`, `initial_open`, `amp_click`, `amp_open`, `amp_initial_open` |
| `gen_event` | `generation_failure`, `generation_rejection` |
| `unsubscribe_event` | `list_unsubscribe`, `link_unsubscribe` |
| `relay_event` | `relay_injection`, `relay_rejection`, `relay_delivery`, `relay_tempfail`, `relay_permfail` |
| `ab_test_event` | `ab_test_completed`, `ab_test_cancelled` |
| `ingest_event` | `success`, `error` |

The `developers.sparkpost.com/api/webhooks/` "Webhook Event Types" list documents 26 types.
The live Events Documentation endpoint also returns `sms_status` under `message_event`
(27 in total) — the examples in this skill route it through `message_event` like the rest, but
treat it as SMS-specific and not part of the published email list.

**Discover the authoritative list at runtime** (no auth required for the documentation
endpoint):

```bash
curl https://api.sparkpost.com/api/v1/webhooks/events/documentation
```

That response is keyed by wrapper (`message_event`, `track_event`, …), then by event type, and
gives every field's `description` and `sampleValue`. It is the best source for payload
fixtures. A regional equivalent exists at `https://api.eu.sparkpost.com/api/v1/...`.

## Common Event Types

| Event | Wrapper | Triggered When | Common Use Cases |
|-------|---------|----------------|------------------|
| `delivery` | `message_event` | Remote server accepted the message | Confirm delivery, delivery-rate metrics |
| `bounce` | `message_event` | Remote server rejected at delivery time | Suppress address, classify hard vs soft |
| `injection` | `message_event` | Message accepted into SparkPost | Confirm send accepted, reconcile counts |
| `delay` | `message_event` | Temporary failure; message queued for retry | Monitor deferrals per mailbox provider |
| `spam_complaint` | `message_event` | Recipient reported the message as spam (FBL) | Remove from list, reputation alerting |
| `out_of_band` | `message_event` | Async bounce arriving after acceptance | Suppress address |
| `policy_rejection` | `message_event` | SparkPost policy rejected the message | Fix sending configuration |
| `click` | `track_event` | Tracked link clicked | Engagement, click-through rate |
| `open` | `track_event` | Open pixel fetched | Engagement tracking |
| `initial_open` | `track_event` | First open pixel (distinct from `open`) | De-duplicated open counts |
| `amp_click` / `amp_open` / `amp_initial_open` | `track_event` | AMP-for-email equivalents | AMP engagement |
| `generation_failure` | `gen_event` | Templating/substitution failed before send | Fix template or recipient data |
| `generation_rejection` | `gen_event` | Generation rejected (e.g. suppression) | Audit suppression hits |
| `list_unsubscribe` | `unsubscribe_event` | `List-Unsubscribe` header used | Update subscription state |
| `link_unsubscribe` | `unsubscribe_event` | In-body unsubscribe link used | Update subscription state |
| `relay_injection` / `relay_rejection` / `relay_delivery` / `relay_tempfail` / `relay_permfail` | `relay_event` | Inbound relay message lifecycle | Monitor inbound relay health |
| `ab_test_completed` / `ab_test_cancelled` | `ab_test_event` | A/B test finished or cancelled | Record winning template |
| `success` / `error` | `ingest_event` | Events API ingest batch result | Monitor your own ingest pipeline |

## Field Types: Numbers Are Usually Strings

This is the single biggest source of bugs. Per the documented sample values:

| Field | Sample value | Note |
|-------|--------------|------|
| `timestamp` | `"1460989507"` | Unix **seconds**, as a **string** |
| `num_retries` | `"2"` | string |
| `bounce_class` | `"1"` | string |
| `subaccount_id` | `"101"` | string |
| `customer_id` | `"1"` | string |
| `msg_size` | `"1337"` | string |
| `error_code` | `"554"` | string |
| `event_id` | `"92356927693813856"` or `"0e5cf1fc-cb36-4c39-b695-3651b6ea6563"` | opaque string |
| `injection_time` | `"2016-04-18T14:25:07.000Z"` | ISO 8601 string |
| `open_tracking`, `click_tracking`, `amp_enabled` | `true` | actual booleans |
| `number_succeeded`, `number_duplicates` (`ingest_event`) | `500`, `350` | actual numbers |

`event_id`'s *"format … is not consistent across events — for some event types this may be a
large integer, while for others it may be a UUID"*. Never parse it; use it as an opaque
dedupe key. `sms_status` is the exception: its field list in the live Events Documentation
endpoint has **no `event_id` at all**, so event-level dedupe for that type needs a fallback
(e.g. a hash of the entry, or `sms_remoteids` + `timestamp`) alongside the batch id.

Coerce with `String(x)` / `str(x)` before comparing, and `parseInt(timestamp, 10) * 1000` /
`int(timestamp)` when converting to a date.

## Common Fields Across Events

`event_id`, `type`, `timestamp`, `message_id`, `transmission_id`, `rcpt_to`, `raw_rcpt_to`,
`rcpt_hash`, `campaign_id`, `subaccount_id`, `customer_id`, `rcpt_meta` (your per-recipient
metadata object), `rcpt_tags` (array), `friendly_from`, `msg_from`, `subject`, `template_id`,
`template_version`, `ip_pool`, `sending_ip`, `recipient_domain`, `mailbox_provider`,
`mailbox_provider_region`, `transactional`.

### Per-event additions

| Event | Extra fields |
|-------|--------------|
| `bounce`, `out_of_band` | `bounce_class`, `error_code`, `reason`, `raw_reason` |
| `delay` | `bounce_class`, `error_code`, `reason`, `raw_reason`, `num_retries`, `queue_time` |
| `delivery` | `num_retries`, `queue_time`, `outbound_tls`, `delv_method` |
| `click`, `amp_click` | `target_link_url`, `target_link_name`, `user_agent`, `user_agent_parsed`, `geo_ip` |
| `open`, `initial_open` | `user_agent`, `user_agent_parsed`, `geo_ip` |
| `spam_complaint` | `fbtype` (e.g. `"abuse"`), `report_by`, `report_to` |
| `generation_failure`, `generation_rejection` | `error_code`, `reason`, `raw_reason`, `rcpt_subs` |
| `list_unsubscribe` | `mailfrom` |
| `ab_test_completed`, `ab_test_cancelled` | `ab_test` object (`id`, `name`, `version`, `variants[]`, `default_template`, `winning_template_id`, `engagement_metric`, `test_mode`) |
| `ingest_event` `success` | `batch_id`, `number_succeeded`, `number_duplicates`, `expiration_timestamp` |
| `ingest_event` `error` | `batch_id`, `error_type`, `href`, `number_failed`, `number_succeeded`, `number_duplicates`, `retryable` |

`geo_ip` is an object: `{ city, country, region, postal_code, latitude, longitude, zip }`.
`user_agent_parsed` is an object: `{ agent_family, device_brand, device_family, is_mobile, is_prefetched, is_proxy, os_family, os_version }`.

SparkPost warns that the payload grows over time: *"From time to time as SparkPost releases
new features additional fields or event types will be added to webhooks payloads. Webhooks
consumers should be flexible enough to accept additive changes to the payload."* Handle unknown
`type` values by logging and returning 200 — never by failing the batch.

## The Test / Validation Batch

*"When a webhook is created, a test POST request is sent to the target URL. If this request
does not receive an HTTP 200 response, your request to the Webhook API will fail with HTTP 400
and the webhook will not be created."* The same happens when you change the target URL.

`POST /api/v1/webhooks/{id}/validate` sends this documented sample batch:

```json
[ { "msys": {} } ]
```

An array whose element has an **empty `msys` object** — no event class key at all. Handlers
**must** accept it and return 200. There is no "ping" event type to switch on.

## Batch Delivery, Retries, Idempotency

| Property | Value |
|----------|-------|
| Method / body | `POST`, JSON array |
| Expected response | **HTTP 200** |
| Timeout | 10 seconds per attempt |
| Retries | Logarithmic backoff, giving up after 8 hours; 12 attempts total (initial + 11 retries) |
| Batch size | 1 to 350+ events, event classes mixed |
| Ports | 80 (HTTP) and 443 (HTTPS) only |
| First events | ~1 minute after webhook creation |
| Batch status retention | 24 hours (failed and eventually-succeeded batches only) |

Deduplicate on the `X-MessageSystems-Batch-ID` request header (*"useful for detecting and
prevention of processing duplicate batches"*) and on each event's `event_id`. SparkPost's
support docs add: *"If you get a duplicate batch, return a 200 response so SparkPost will not
keep retrying."* Look the header up case-insensitively — it is also spelled
`X-Messagesystems-Batch-Id`.

## Relay Webhooks (Inbound Email)

A **separate API** (`/api/v1/relay-webhooks`) that relays inbound email to your app. Payload is
a JSON array of `relay_message` objects:

```json
[
  {
    "msys": {
      "relay_message": {
        "content": {
          "email_rfc822": "From: sender@example.com\r\nTo: inbound@parse.example.com\r\n...",
          "email_rfc822_is_base64": false,
          "headers": [{ "Subject": "Hello" }],
          "html": "<p>Hello</p>",
          "text": "Hello",
          "subject": "Hello",
          "to": ["inbound@parse.example.com"]
        },
        "customer_id": "1",
        "friendly_from": "sender@example.com",
        "msg_from": "sender@example.com",
        "rcpt_to": "inbound@parse.example.com",
        "webhook_id": "4839201967643219",
        "protocol": "smtp"
      }
    }
  }
]
```

Differences from event webhooks:

- `auth_type` enum is only **`none` | `oauth2`** — **relay webhooks have no Basic Auth mode.**
- `auth_token` → the `X-MessageSystems-Webhook-Token` header: *"Use this token in your target
  application to confirm that data is coming from SparkPost."*
- `custom_headers` is also supported.
- A `match` object (`match.domain`, `match.protocol`) restricts which inbound messages relay.

**Do not confuse `relay_message` with `relay_event`.** `relay_message` is inbound email content
delivered by **relay** webhooks. `relay_event` (`relay_injection`, `relay_delivery`,
`relay_tempfail`, `relay_permfail`, `relay_rejection`) are *status* events about relaying,
delivered by **event** webhooks. The example handlers recognise a `relay_message` entry and log
it, but the primary route is for event webhooks.

## Full Event Reference

- [Event Webhooks API](https://developers.sparkpost.com/api/webhooks/)
- [Relay Webhooks API](https://developers.sparkpost.com/api/relay-webhooks/)
- [Events Documentation endpoint](https://api.sparkpost.com/api/v1/webhooks/events/documentation) — machine-readable field list
- [Webhook Event Reference](https://support.sparkpost.com/docs/tech-resources/webhook-event-reference/)
- [Event Webhook Authentication and Security](https://github.com/SparkPost/support-docs/blob/main/content/docs/tech-resources/webhook-authentication.md)
