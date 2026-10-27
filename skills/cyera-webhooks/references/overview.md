# Cyera Privacy Webhooks Overview

## What Are Cyera Privacy Webhooks?

Cyera Privacy (the privacy-request product formerly DataGrail, not Cyera's DSPM platform) automates
data-subject privacy requests across integrated systems. Its **webhook integration** sends an HTTP
`POST` with a JSON body to your endpoint whenever it needs your system to act: a new access,
deletion or opt-out request, a health check, or a readiness check. Each delivery is signed with
`X-Webhook-Signature` (see [verification.md](verification.md)).

Source: https://integrations.privacy.cyera.io/docs/integrations/webhooks

## Request Types

The body's `request_type` tells you what to do:

| `request_type` | Triggered When | Respond with |
|----------------|----------------|--------------|
| `health_check` | Cyera checks the endpoint is alive | `200 OK` |
| `access` | A data-subject access request is created | `201 Created` |
| `deletion` | A data-subject deletion request is created | `201 Created` |
| `opt_out` | An opt-out request is created (`topic: opt_out:create`) | `201 Created` |
| `readiness_check` | A Readiness Check is configured on the integration and Cyera asks its question | `200 OK` (the docs give no code for readiness checks) |

The docs show sample bodies for `access`, `opt_out`, `health_check` and `readiness_check`; there is
no separate deletion sample, so the examples reuse the access shape for deletion.

## Payload Structure

Common fields: `request_type`, `integration_name`, `integration_kind` (`webhook`),
`webhook_request_id`.

Access / deletion / opt-out add:

- `topic` (`privacy_request:create`, `opt_out:create`)
- `identifiers`: e.g. `{"email": [{"email": "john@example.com"}], "user_id": [{"user_id": "100101"}]}`
- `webhook_callback_url`: where to report completion
- `privacy_request_id` and `integration_id` (access/deletion), or `opt_out_request_id` and `integration_state_id` (opt-out)

Readiness checks add `question` ("Is the system ready to process this request?") and `answers`
(`["Yes", "No"]`) alongside the identifiers, callback URL and ids. The docs' text for the
reply format is not reproduced here; check the readiness section of the Cyera docs for it.

```json
{
  "request_type": "access",
  "integration_name": "Webhook Integration",
  "integration_kind": "webhook",
  "topic": "privacy_request:create",
  "identifiers": { "email": [{ "email": "john@example.com" }] },
  "webhook_callback_url": "https://acme.privacy.cyera.io/api/v2/webhooks/callback",
  "privacy_request_id": "4b7a02e2-361e-4957-9d69-b381e3f47758",
  "webhook_request_id": "3aa32ca6-e60d-4b71-981a-d1ba258fd712"
}
```

## Delivery and Responses

- `201 Created` when a privacy request was created.
- `200 OK` for health checks and reminders.
- `4xx` / `5xx` when the request was **not** created.
- Retries are not documented. Deduplicate on the request ids (`privacy_request_id`, `opt_out_request_id`) and `webhook_request_id`.
- Requests identify themselves with the `user-agent: privacyclient/1.0` header in the doc samples.

## Reporting Completion

Completion is reported **later** by a `PUT` to the body's `webhook_callback_url`, authenticated with an
API key. That callback is outside the scope of this skill.

## Full Reference

See [Cyera's webhook integration docs](https://integrations.privacy.cyera.io/docs/integrations/webhooks).
