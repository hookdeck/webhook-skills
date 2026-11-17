# Honeycomb Webhooks Overview

## What Are Honeycomb Webhooks?

Honeycomb's Webhook integration (Team Settings > Integrations > Trigger, SLOs, and Anomaly
Detection Recipients) sends a JSON payload to any HTTP endpoint when a Trigger fires, an SLO burn
alert fires or Anomaly Detection raises a signal. Requests are not signed. Every request carries
the integration's Shared Secret in an `X-Honeycomb-Webhook-Token` header so you can confirm it
came from your Honeycomb webhook.

## Headers Honeycomb Always Sends

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |
| `User-Agent` | `Honeycomb Triggers` |
| `X-Honeycomb-Webhook-Token` | The value of the webhook integration's Shared Secret |
| `X-Honeycomb-Webhook-Delivery-ID` | Unique per delivery, **the same across retries** of that delivery |

Custom headers you add (up to 5) can't use the names `Content-Type`, `User-Agent` or
`X-Honeycomb-Webhook-Token`.

## Alert Kinds

Honeycomb has no event-type field; the kind depends on what the webhook is attached to.

| Kind (`kind` in the examples) | Status values | Common Use Cases |
|----------------------|----------------|------------------|
| Trigger (`trigger`) | `TRIGGERED`, `OK` | Page on-call, open an incident |
| SLO Budget Rate burn alert (`budget_rate`) | `TRIGGERED`, `OK` | Escalate before the budget runs out |
| SLO Exhaustion Time burn alert (`exhaustion_time`) | `TRIGGERED`, `OK` | Escalate before the budget runs out |
| Anomaly Detection (`anomaly`) | `Detected`, `Resolved` | Open an investigation |

## Payload Structure

The body is `application/json` and carries the result of the alert. Honeycomb doesn't document
the standard payload field by field. A webhook can instead use a custom JSON template for each of
the four alert types (Trigger, Budget Rate Burn, Exhaustion Time Burn, Anomaly Detection), built
from [Honeycomb's template variables](https://docs.honeycomb.io/notify/webhooks/variables), such
as `.Alert.Status`, `.Alert.Summary`, `.Alert.InstanceID`, `.Alert.Timestamp` and `.Alert.IsTest`.
Put a constant `kind` field in each template: the example handlers classify on it and fall back
to `unknown`. Honeycomb's [example templates](https://docs.honeycomb.io/notify/webhooks/example-templates)
show complete templates for Discord, incident.io and OpsGenie.

## Delivery and Retries

- Respond within **15 seconds**. A timeout fails the delivery and Honeycomb does not retry it.
- Up to three retries, with a short increasing delay, on `408`, `502`, `429`/`503` with a
  `Retry-After` header, and connection-level failures. Any other `4xx` or `5xx` fails without a
  retry.
- Use `X-Honeycomb-Webhook-Delivery-ID` to deduplicate.

## Full Reference

See [Honeycomb's webhook documentation](https://docs.honeycomb.io/notify/webhooks).
