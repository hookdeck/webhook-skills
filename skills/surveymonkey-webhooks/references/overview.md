# SurveyMonkey Webhooks Overview

## What SurveyMonkey Sends

SurveyMonkey webhook callbacks are `POST` requests. Each webhook listens for one event type on the surveys, collectors or app you filter by, and posts a small JSON body naming the event and the IDs involved.

| Header | Value |
|---|---|
| `Sm-Apikey` | Your app's client ID (or API key, for apps on old authentication) |
| `Sm-Signature` | Base64 HMAC-SHA1 of the body |
| `Content-Type` | `application/vnd.surveymonkey.<object type>.v1+<payload format>`, for example `application/vnd.surveymonkey.response.v1+json` |

If the webhook was created with an `authorization` value, SurveyMonkey also sends it as the `Authorization` header.

## Payload

| Field | Meaning |
|---|---|
| `name` | Webhook name |
| `filter_type` | What the webhook filters by: `survey` or `collector` |
| `filter_id` | ID of the object that triggered the event |
| `event_type` | The event |
| `event_id` | Event ID: dedupe on it |
| `object_type` / `object_id` | The object the event happened to (for example `response` and its ID) |
| `event_datetime` | ISO 8601 time of the event |
| `resources` | Related IDs: `respondent_id`, `recipient_id`, `collector_id`, `survey_id`, `user_id`, depending on the webhook |

The body carries IDs only. Fetch response details from the API.

## Event Types

From the [SurveyMonkey API docs](https://api.surveymonkey.com/v3/docs) (Webhooks):

| Event | Fired when |
|---|---|
| `response_completed` | A survey response is completed |
| `response_disqualified` | A survey response is disqualified |
| `response_updated` | A survey response is updated: one event per page of the survey |
| `response_created` | A respondent begins a survey |
| `response_deleted` | A response is deleted |
| `response_overquota` | A response is over a survey's quota |
| `survey_created` / `survey_updated` / `survey_deleted` | A survey is created, updated or deleted |
| `collector_created` / `collector_updated` / `collector_deleted` | A collector is created, updated or deleted |
| `app_installed` / `app_uninstalled` | An app is installed or uninstalled |

## Filters

| `event_type` | `object_type` |
|---|---|
| Response, collector and app events, `survey_updated`, `survey_deleted` | Required |
| `survey_created` | Optional |
| `survey_updated`, `survey_deleted` | Must be `survey` |
| `collector_created` | Can't be `collector` |
| `app_installed`, `app_uninstalled` | `app` (only these use it) |

When `object_type` is set, `object_ids` must list the IDs to watch.

## Delivery

The API docs don't describe retries, timeouts or ordering. Respond `200` quickly and dedupe on `event_id`. Public apps need the View Webhooks scope to list webhooks and Create/Modify Webhooks to create them.
