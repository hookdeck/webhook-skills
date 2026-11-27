# Oura Webhooks Overview

## What Are Oura Webhooks?

Oura webhooks notify your application in near real-time (~30 seconds after a ring syncs)
when new health data is available for a user, instead of you polling the API. Webhooks are
Oura's **recommended** way to consume data — they avoid rate limits and keep your app fresh.

Notifications are **thin**: they tell you *what* changed (`data_type`, `event_type`) and
give you an `object_id`. You then fetch the full record from the Oura API using that ID.

## The Two Request Types

Your callback URL receives two kinds of HTTP requests:

| Method | Purpose | How you respond |
|--------|---------|-----------------|
| `GET`  | One-time subscription handshake | `200` + JSON `{"challenge": "<value>"}` |
| `POST` | Event delivery | Verify `x-oura-signature`, then `2xx` within 10s |

See [setup.md](setup.md) for the handshake flow and [verification.md](verification.md) for
signature details.

## Event Types (`event_type`)

Every subscription is bound to exactly one `event_type`:

| `event_type` | Meaning |
|--------------|---------|
| `create` | A new record of this data type was created |
| `update` | An existing record was updated |
| `delete` | A record was deleted |

## Data Types (`data_type`)

A subscription is one `data_type` + `event_type` combination — subscribe separately for
each pairing you need. The full enum (16 values):

| `data_type` | Description |
|-------------|-------------|
| `tag` | User-created tag (deprecated by Oura; use `enhanced_tag`) |
| `enhanced_tag` | Enhanced tag with start/end times |
| `workout` | Workout activity |
| `session` | Guided/unguided session (e.g. breathing, meditation) |
| `sleep` | Sleep period (detailed) |
| `daily_sleep` | Daily sleep summary and score |
| `daily_readiness` | Daily readiness score |
| `daily_activity` | Daily activity summary and score |
| `daily_spo2` | Daily blood oxygen (SpO2) average |
| `sleep_time` | Recommended bedtime window |
| `rest_mode_period` | Rest mode period |
| `ring_configuration` | Ring hardware/firmware configuration |
| `daily_stress` | Daily stress summary |
| `daily_cardiovascular_age` | Daily cardiovascular age |
| `daily_resilience` | Daily resilience |
| `vo2_max` | VO2 max estimate |

## Event Payload Structure

Every `POST` event body has the same thin shape:

```json
{
  "event_type": "update",
  "data_type": "sleep",
  "object_id": "12345abc",
  "event_time": "2023-01-01T08:00:00+00:00",
  "user_id": "user123"
}
```

| Field | Description |
|-------|-------------|
| `event_type` | `create`, `update`, or `delete` |
| `data_type` | Which data type changed (see table above) |
| `object_id` | ID of the changed record — use it to fetch full data via the API |
| `event_time` | ISO-8601 timestamp of the event |
| `user_id` | Oura user the event belongs to |

To get the full record, call the matching Oura API route with `object_id`, e.g.
`GET https://api.ouraring.com/v2/usercollection/sleep/{object_id}` for `data_type: "sleep"`.

## Delivery, Retries, and Expiration

- **Respond within 10 seconds** with a `2xx` status. Do heavy work asynchronously.
- Oura **retries up to 10 times** on `4xx`, `5xx`, or timeout, for about an hour — handle events idempotently.
- Respond **`410 Gone`** to have Oura auto-cancel the subscription.
- Subscriptions have an `expiration_time` and must be **renewed** before they expire
  (see [setup.md](setup.md)). Oura's docs don't give the lifetime, so read `expiration_time`.

## Full Event Reference

See the [Oura Webhook Subscription docs](https://cloud.ouraring.com/v2/docs#tag/Webhook-Subscription-Routes).
