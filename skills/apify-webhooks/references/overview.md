# Apify Webhooks Overview

## What Are Apify Webhooks?

Apify webhooks make the platform send an HTTP POST with a JSON payload to a URL you choose when
a system event happens, for example to start another Actor when a run finishes or fails. You
configure them under the **Integrations** tab of an Actor or task in Apify Console (or through
the API as ad-hoc webhooks). The only available action is "send HTTP request".

Requests are not signed. The only built-in authentication is whatever you add yourself: a secret
in the URL, or a custom header from the **Headers template**. This skill uses a secret header.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `ACTOR.RUN.CREATED` | A new Actor run is created | Track run starts |
| `ACTOR.RUN.SUCCEEDED` | A run finishes with status `SUCCEEDED` | Fetch the dataset, start the next step |
| `ACTOR.RUN.FAILED` | A run finishes with status `FAILED` | Alert, open a ticket |
| `ACTOR.RUN.ABORTED` | A run finishes with status `ABORTED` | Clean up |
| `ACTOR.RUN.TIMED_OUT` | A run finishes with status `TIMED-OUT` | Alert, retry |
| `ACTOR.RUN.RESURRECTED` | A run is resurrected | Track retries |
| `ACTOR.BUILD.CREATED` | A new Actor build is created | Track builds |
| `ACTOR.BUILD.SUCCEEDED` | A build finishes with status `SUCCEEDED` | Deploy notification |
| `ACTOR.BUILD.FAILED` | A build finishes with status `FAILED` | Alert |
| `ACTOR.BUILD.ABORTED` | A build finishes with status `ABORTED` | Clean up |
| `ACTOR.BUILD.TIMED_OUT` | A build finishes with status `TIMED-OUT` | Alert |

Note the status strings: the event is `TIMED_OUT` (underscore) while the run/build status is
`TIMED-OUT` (hyphen).

## Event Payload Structure

Default payload template:

```json
{
  "userId": "abf6vtB2nvQZ4nJzo",
  "createdAt": "2019-01-09T15:59:56.408Z",
  "eventType": "ACTOR.RUN.SUCCEEDED",
  "eventData": {
    "actorId": "fW4MyDhgwtMLrB987",
    "actorRunId": "uPBN9qaKd2iLs5naZ"
  },
  "resource": {
    "id": "uPBN9qaKd2iLs5naZ",
    "actId": "fW4MyDhgwtMLrB987",
    "userId": "abf6vtB2nvQZ4nJzo",
    "startedAt": "2019-01-09T15:59:40.750Z",
    "finishedAt": "2019-01-09T15:59:56.408Z",
    "status": "SUCCEEDED"
  }
}
```

- `eventData` for run events: `actorId`, `actorRunId`, and `actorTaskId` when a task started the run.
- `eventData` for build events: `actorId`, `actorBuildId`.
- `resource` is the run or build object, as returned by the Get Actor run / Get Actor build API.
- `eventData` and `resource` contain redundant data for backward compatibility.
- You can customize the payload with a **Payload template** (`{{variable}}` syntax), so a custom
  webhook may not have these exact fields.

To fetch results after `ACTOR.RUN.SUCCEEDED`, call
`https://api.apify.com/v2/actor-runs/[ACTOR_RUN_ID]/dataset/items` with your API token.

## Delivery Behavior

- Your endpoint must answer `2XX`. Otherwise Apify retries with exponential backoff (about 1 min,
  2 min, 4 min, ... up to the eleventh retry after about 32 hours), then gives up.
- Requests time out after 2 minutes; respond quickly and process asynchronously.
- A webhook may occasionally be delivered more than once. Make handlers idempotent; the
  `X-Apify-Webhook-Dispatch-Id` header identifies the dispatch.

## Full Event Reference

See [Apify's webhook documentation](https://docs.apify.com/platform/integrations/webhooks) and
[event types](https://docs.apify.com/platform/integrations/webhooks/events).
