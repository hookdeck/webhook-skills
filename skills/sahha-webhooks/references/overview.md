# Sahha Webhooks Overview

## What Are Sahha Webhooks?

[Sahha](https://sahha.ai) is a health-data API that turns wearable and phone data into scores, biomarkers and archetypes per user profile. Webhooks push these results to your server as they are produced, so you don't poll. You manage endpoints and event types on the **Webhooks** page of the [Sahha Dashboard](https://app.sahha.ai/dashboard/webhooks).

## Common Event Types

The event type is sent in the `X-Event-Type` header.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `ScoreCreatedIntegrationEvent` | A health score is generated or updated (activity, sleep, readiness, wellbeing, mental_wellbeing) | Dashboards, coaching nudges |
| `BiomarkerCreatedIntegrationEvent` | A biomarker value is calculated (steps, resting heart rate, sleep duration, ...) | Trends, goal tracking |
| `ArchetypeCreatedIntegrationEvent` | A profile is assigned an archetype (activity_level, chronotype, sleep_pattern, ...) | Segmentation, personalisation |
| `TagReceivedIntegrationEvent` | A tag arrives (symptom, medication, shift, subscription, ...) | Context for scores, audit |
| `DataLogReceivedIntegrationEvent` | Raw samples arrive from a user's device (HealthKit / Health Connect) | Raw data pipelines |

## Request Headers

| Header | Meaning |
|--------|---------|
| `X-Signature` | Hex HMAC-SHA256 of the raw body, keyed with your secret |
| `X-External-Id` | The profile's external identifier in your system |
| `X-Event-Type` | One of the event types above |

## Event Payload Structure

Payloads carry `profileId`, `accountId` and `externalId` (webhook payloads include these, API responses may not), plus event-specific fields:

- **Score**: `id`, `type`, `state`, `score` (0.0-1.0), `factors[]`, `dataSources[]`, `scoreDateTime`, `createdAtUtc`, `version`
- **Biomarker**: `id`, `category`, `type`, `periodicity`, `aggregation`, `value` (string), `unit`, `valueType`, `startDateTime`, `endDateTime`
- **Archetype**: `id`, `name`, `value`, `dataType`, `periodicity`, `ordinality`, `startDateTime`, `endDateTime`
- **Tag**: `id`, `type` (`event` or `state`), `category`, `name`, `value`, `source`, `startDateTime`, `endDateTime`, `receivedAtUtc`, `additionalProperties`
- **Data log**: `logType`, `dataType`, `receivedAtUtc`, `dataLogs[]` (`id`, `value`, `unit`, `source`, `startDateTime`, `endDateTime`, ...)

## Delivery Behaviour

- Respond with a `2xx` within **30 seconds**.
- Failed deliveries are retried up to **5 times** with exponential backoff.
- Events may arrive **out of order**; sequence with the timestamps in the payload.
- Scores and biomarkers are held for the interval you configure (real-time, or 1-720 minutes) and only the final value for a metric and profile is sent when it ends. Data logs and tags are always immediate.
- A tag's identity is `profileId + name + type + source + startDateTime`, not `id`; the same tag can be re-sent (for example to close an open state), so dedupe on that tuple.

## Full Event Reference

See [Sahha's webhook docs](https://sahha.ai/docs/connect/webhooks/) and the [event reference](https://sahha.ai/docs/connect/webhooks/events/).
