# SurveyMethods Webhooks Overview

## What Are SurveyMethods Webhooks?

SurveyMethods is an online survey platform. A webhook posts a JSON event to your URL when something
happens in your account, for all surveys or for one. Webhooks are available on the Professional,
Team Professional and Enterprise plans. A 2xx response within 30 seconds acknowledges a delivery;
otherwise (or if your endpoint is unreachable) it is retried, up to 5 attempts in all with growing
spacing. Delivery is at-least-once, so deduplicate on `eventId`. Delivery logs are in
Account > Webhooks.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `response.completed` | A respondent completes a survey response | Sync answers to a CRM or warehouse, alert a team |
| `response.created` | A survey response is started | Track response starts and drop-off |
| `survey.created` | A survey is created | Catalogue surveys, provision dashboards |
| `collector.created` | A collector is created | Track distribution channels |

## Event Payload Structure

```json
{
  "eventId": "6a1f0c3e-2b9d-4f7a-9c51-0e8d2f4b7a10",
  "eventType": "response.completed",
  "eventTime": "2026-10-23T10:15:02Z",
  "data": {
    "surveyId": "12345",
    "respondentId": 6789,
    "collectorId": 456,
    "completedDateTimeUtc": "2026-10-23T10:15:00Z",
    "responses": { "910001": "3", "910002": "Great support team." }
  }
}
```

The event type is in the body's `eventType` and repeated in the `X-SurveyMethods-Event-Type` header;
`eventId` is also sent as `X-SurveyMethods-Event-Id`.

## Full Event Reference

See [SurveyMethods' webhook documentation](https://surveymethods.com/kb/webhooks/).
