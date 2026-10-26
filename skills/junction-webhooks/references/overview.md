# Junction Webhooks Overview

## What Are Junction Webhooks?

[Junction](https://junction.com) (formerly Vital) is a health-data API for wearables, lab testing
and continuous queries. It sends an HTTPS `POST` to an endpoint you register when a user connects
a provider, when a historical backfill finishes, when new or changed wearable data arrives, when a
lab order or appointment changes, and when a Sense continuous query's result table changes.
Delivery and signing are handled by [Svix](https://www.svix.com/).

| Aspect | Value |
|--------|-------|
| Method | `POST`, JSON body |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Success | Any `2xx` within 15 seconds; anything else, `3xx` included, is a failure |
| Alternative | [ETL Pipelines](https://docs.junction.com/webhooks/etl-pipelines/overview.md) stream the same events to Pub/Sub, RabbitMQ or Event Hubs |

## Event Payload Structure

Every event has the same envelope:

```json
{
  "event_type": "daily.data.activity.created",
  "data": {
    "id": "715dd6a5-0c67-471c-b5fe-9681a980a2c2",
    "steps": 1496,
    "source": { "name": "Apple HealthKit", "slug": "apple_health_kit", "logo": "https://..." },
    "user_id": "4a29dbc7-6db3-4c83-bfac-70a20a4be1b2"
  },
  "team_id": "6b74423d-0504-4470-9afb-477252ccf67a",
  "user_id": "4a29dbc7-6db3-4c83-bfac-70a20a4be1b2",
  "client_user_id": "01HW3FSNVCHC3B2QB5N0ZAAAVG"
}
```

- `event_type` is top-level and names the payload in `data`.
- `team_id`, `user_id` and `client_user_id` (your own reference for the user) are top-level.
- Wearable data events add `data.source` (`name`, `slug`, `logo`) and `data.user_id`.
- **Summary types** (activity, sleep, workouts, body, ...) put the summary object at `data`,
  identified by `data.id`. The latest version of a given `id` replaces earlier ones.
- **Timeseries types** (steps, heartrate, glucose, ...) put the samples under `data.data`. A sample
  is identified by resource type, provider, source type and timestamp; the latest value replaces
  earlier ones.
- **Workout streams** are shallow: minimal metadata only, fetch the stream through the API.
- `historical.data.{resource}.created` is data-less: it carries the user, provider and the date
  range that was backfilled. Fetch the data through the Data Access API.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `provider.connection.created` | A user connects a provider through Junction Link | Mark the user as connected |
| `provider.connection.error` | A provider connection fails, such as expired credentials | Ask the user to reconnect |
| `provider.device.created` | A device is added to a connection | Track devices |
| `provider.device.updated` | A device changes | Track devices |
| `historical.data.{resource}.created` | The historical backfill for a resource has fully completed | Fetch the backfilled data |
| `daily.data.{resource}.created` | New data for a resource is discovered | Ingest into your database |
| `daily.data.{resource}.updated` | Existing data for a resource changes | Replace the stored version |
| `labtest.order.created` | A lab test order is created | Track the order |
| `labtest.order.updated` | A lab test order changes status | Update order state |
| `labtest.appointment.created` | A lab appointment is created | Show the appointment |
| `labtest.appointment.updated` | A lab appointment changes | Update the appointment |
| `labtest.result.critical` | A lab result contains a critical value | Alert clinical staff urgently |
| `continuous_query.result_table.changed` | A Sense continuous query's result table changes | Fetch the new result table |

`{resource}` is a resource name such as `activity`, `body`, `meal`, `menstrual_cycle`, `profile`,
`electrocardiogram`, `sleep`, `sleep_cycle`, `workouts`, `steps`, `heartrate`, `glucose`,
`blood_pressure`, `hrv` or `weight`. The `daily.data` prefix is a misnomer for incremental data:
it does not mean one delivery per day, and events are sent as soon as Junction discovers them.

The examples route all of these. They match `daily.data.*` and `historical.data.*` by pattern so
every resource is covered, and acknowledge anything else with `200`.

## Full Event Reference

Junction documents about 185 event types in the
[Event Catalog](https://docs.junction.com/event-catalog/provider.connection.created.md) (the list
may not be exhaustive): the 4 `provider.*` events, 114 `daily.data.*` events (57 resources, each
with `created` and `updated`), 57 `historical.data.*.created` events, the lab test events and
`continuous_query.result_table.changed`. Schemas and example payloads are also in the Event
Catalog tab of the Webhooks section in the Junction dashboard.

## Retries and Ordering

Junction retries any non-`2xx` response, timeout, or `3xx` redirect: immediately, then after 5
seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours and a further 10 hours. After the last
attempt the message is marked `Failed` and a `message.attempt.exhausted` event is sent. If every
attempt to an endpoint fails for 5 days, the endpoint is disabled. Use **Recover** in the
dashboard to replay failed messages from a given date.

Junction does not aggregate or prioritize data events across providers: you may get several
events of the same type for one user because they have several sources or providers. Deduplicate
on `svix-id`, make effects idempotent, and replace stored summaries by `data.id`.

For more, see Junction's [webhook introduction](https://docs.junction.com/webhooks/introduction.md),
[event structure](https://docs.junction.com/webhooks/event-structure.md) and
[retry policy](https://docs.junction.com/webhooks/retry-policy.md).
