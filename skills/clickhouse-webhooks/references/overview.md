# ClickHouse (ClickStack) Webhooks Overview

## What Are ClickStack Alert Webhooks?

Covers ClickStack alert webhooks of type Generic only.

ClickStack, ClickHouse's observability stack built on HyperDX, evaluates search alerts and
dashboard chart alerts on a recurring interval. When a threshold condition is met the alert
fires and ClickStack sends a notification to the webhook destination attached to the alert.
Service types are Slack, PagerDuty and Generic; only Generic delivers to your own endpoint.
ClickHouse Cloud's control plane has no event webhooks.

## Event Types

ClickHouse documents **no event names**. The vendor adds no event field to the request: the body
is a template you write. A fired alert is the only notification documented (a passing evaluation
sends nothing), so there is nothing to switch on unless your own template adds a field.

## Payload

The Generic webhook body is optional and supports three template variables:

| Variable | Contains |
|----------|----------|
| `{{title}}` | Alert title |
| `{{body}}` | Alert description |
| `{{link}}` | Link to the search or chart the alert is attached to |

The examples in this skill use this **illustrative** template (not a vendor-defined schema):

```json
{"title": "{{title}}", "body": "{{body}}", "link": "{{link}}"}
```

An alert-triggered delivery with that template looks like (illustrative):

```json
{"title": "High error rate", "body": "Alert fired: error count >= 100 over 5m", "link": "https://clickstack.example.com/search/abc123"}
```

HTTP method and content type are not documented, so the examples accept any content type and
treat a body that isn't a JSON object as plain text.

## Full Reference

[Alerts with ClickStack](https://clickhouse.com/docs/use-cases/observability/clickstack/alerts)
