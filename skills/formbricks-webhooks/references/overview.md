# Formbricks Webhooks Overview

## What Are Formbricks Webhooks?

[Formbricks](https://formbricks.com) is an open-source (self-hostable) survey and experience-management platform. A webhook sends an HTTP POST with a JSON body to your endpoint whenever a survey response changes in a Formbricks environment. Webhooks are per environment and are limited to the triggers and surveys you pick. Deliveries follow the [Standard Webhooks](https://standardwebhooks.com/) specification and are signed with the webhook's `whsec_` secret.

## Event Payload Structure

```json
{
  "data": {
    "id": "responseId",
    "surveyId": "surveyId",
    "finished": false,
    "endingId": null,
    "displayId": "displayId",
    "language": "en",
    "contact": null,
    "contactAttributes": null,
    "singleUseId": null,
    "tags": [],
    "variables": {},
    "data": { "welcome_card_cta": "clicked" },
    "dataByQuestionCode": { "newsletter_consent": null, "visit_reason": null },
    "outcome": null,
    "ttc": { "welcome_card_cta": 2154.700000047684 },
    "meta": { "country": "DE", "url": "https://app.formbricks.com/s/surveyId", "userAgent": { "browser": "Chrome", "device": "desktop", "os": "macOS" } },
    "survey": { "title": "Customer Satisfaction Survey", "status": "inProgress", "type": "link", "createdAt": "2025-07-20T10:30:00.000Z", "updatedAt": "2025-07-24T07:45:00.000Z" },
    "createdAt": "2025-07-24T07:47:29.507Z",
    "updatedAt": "2025-07-24T07:47:29.507Z"
  },
  "event": "responseCreated",
  "webhookId": "webhookId"
}
```

| Field | Meaning |
|-------|---------|
| `event` | The event type, for example `responseCreated`. This is what handlers switch on |
| `webhookId` | The id of the Formbricks webhook that sent the delivery |
| `data` | The response object |
| `data.data` | The answers, keyed by question id |
| `data.dataByQuestionCode` | The same answers keyed by question code; unanswered questions are `null`. A delivery queued before a Formbricks update can lack it |
| `data.outcome` | `null`, or `"lowQuality"` when a reviewer marked the response Low quality (still delivered) |
| `data.ttc` | Time spent per question (`_total` appears once the response is finished) |
| `data.finished` / `data.endingId` | Whether the respondent completed the survey, and which ending card they reached |
| `data.survey` | A summary of the survey (title, status, type, timestamps) |
| `data.surveyId` | The survey id; use it to route responses |

There is no event id in the body. The `webhook-id` header is unique per message and stable across retries, so it is the idempotency key.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `responseCreated` | A new survey response is created | Track survey starts, notify a team |
| `responseUpdated` | A response gains or changes answers, or is marked Low quality or restored | Stream partial answers, update a CRM record |
| `responseFinished` | The respondent completes the survey | Send answers to a database, trigger follow-up workflows |

These are the only three triggers: the `PipelineTriggers` enum in [Formbricks' code](https://github.com/formbricks/formbricks/blob/main/packages/database/schema/main.prisma) has no others. The dashboard's **Test Endpoint** button also sends a signed `POST` with the body `{"event":"testEndpoint"}` ([code](https://github.com/formbricks/formbricks/blob/main/apps/web/modules/integrations/webhooks/lib/webhook.ts)). The examples route the three triggers and answer `200` to anything else.

## Delivery Behaviour

- **Acknowledge** with any `2xx` within 5 seconds (`WEBHOOK_DELIVERY_TIMEOUT_MS` when self-hosted). Respond first, then process asynchronously.
- **Retries:** network errors, timeouts, redirects, and `408`, `429` or `5xx` responses are attempted up to 5 times in all, at roughly 30 seconds, then 1, 2 and 4 minutes after the first attempt. After the last attempt the event is dropped and Formbricks does not replay it.
- **No retry on other 4xx:** treat them as a rejection. A signature failure answered with `400` or `401` is final.
- **Idempotency:** every attempt of the same event carries the same `webhook-id`.
- **Cancellation:** deleting a webhook, or removing a trigger or survey from it, cancels queued and retrying deliveries.
- **Transport:** JSON POST. Formbricks refuses webhook URLs on private or internal addresses unless a self-hosted instance sets `DANGEROUSLY_ALLOW_WEBHOOK_INTERNAL_URLS=1`.

## Full Event Reference

See [Formbricks' webhook documentation](https://formbricks.com/docs/platform/features/integrations/webhooks) for the example payload of each trigger.
