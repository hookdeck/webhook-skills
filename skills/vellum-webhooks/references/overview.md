# Vellum Webhooks Overview

## What Are Vellum Webhooks?

Vellum supports real-time monitoring of platform events through its **Webhook Integration**
(organization settings, **Monitoring Integration** section). Vellum posts event data to your
endpoint so you can drive monitoring, alerting, cost tracking, audit logging and custom analytics.

Requests are unsigned by default. You authenticate them with a header credential you configure
(API Key Header or Bearer Token). Vellum can optionally add an HMAC signature
(`X-Vellum-Timestamp`, `X-Vellum-Signature`); Hookdeck's Vellum source and this skill don't
verify it. Vellum's docs don't name the HTTP method, so the examples accept GET, POST, PUT, PATCH
and DELETE.

## Common Event Types

You choose which events are sent. The `name` field carries the event:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `workflow.execution.initiated` | A workflow starts execution | Track runs as they begin |
| `workflow.execution.fulfilled` | A workflow successfully completes | Store outputs, measure latency |
| `workflow.execution.rejected` | A workflow execution fails | Alerting, incident creation |
| `workflow_execution.usage_calculation.fulfilled` | Workflow usage is successfully calculated | Cost tracking |
| `workflow_execution.usage_calculation.rejected` | Workflow usage calculation fails | Flag runs for re-calculation |
| `metric.execution.fulfilled` | A metric execution completes successfully | Custom analytics dashboards |

Vellum's schema example names the usage event `workflow.usage_calculation.fulfilled`, which differs
from the supported-events table. The examples accept both.

## Event Payload Structure

```json
{
  "id": "UUID",
  "timestamp": "ISO-8601 datetime",
  "api_version": "2024-10-25",
  "trace_id": "UUID",
  "span_id": "UUID",
  "parent": { "span_id": "UUID", "parent": null, "deployment_name": "my-deployment" },
  "name": "workflow.execution.rejected",
  "body": {
    "workflow_class": { "name": "string", "module": "string", "bases": [] },
    "error": { "code": "ERROR_CODE", "message": "Error message" }
  }
}
```

- `body` is event-specific: `inputs` (initiated), `outputs` (fulfilled), `error` (rejected),
  `usage` and `cost` (usage calculation).
- `parent` describes what triggered the event (deployment, workflow version, release tag,
  optional `external_id`).
- Dedupe on `id`; handlers should be idempotent.

## Full Event Reference

See [Vellum's webhook documentation](https://docs.vellum.ai/product/monitoring/webhooks).
