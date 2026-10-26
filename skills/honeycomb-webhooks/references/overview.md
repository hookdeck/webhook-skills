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

| Kind (handler label) | Triggered When | Common Use Cases |
|----------------------|----------------|------------------|
| Trigger (`trigger`) | A Trigger fires or resolves | Page on-call, open an incident |
| SLO burn alert (`slo_burn_alert`) | A Budget Rate or Exhaustion Time burn alert fires | Escalate before the budget runs out |
| Anomaly Detection (`anomaly`) | An anomaly signal fires | Open an investigation |

## Payload Structure

The body is `application/json` and carries the result of the alert. The default payload isn't
documented field by field, and a webhook can use a custom JSON template for each of the four
alert types (Trigger, Budget Rate Burn, Exhaustion Time Burn, Anomaly Detection), so field names
are yours to confirm. The example handlers classify by the fields present and fall back to
`unknown`.

An illustrative trigger payload (not Honeycomb's documented schema):

```json
{
  "name": "Slow checkout requests",
  "status": "TRIGGERED",
  "trigger_url": "https://ui.honeycomb.io/example/triggers/abc123",
  "threshold": { "op": ">", "value": 2000 }
}
```

An illustrative SLO burn alert payload:

```json
{
  "slo_name": "Checkout availability",
  "alert_type": "exhaustion_time",
  "budget_remaining": 0.12
}
```

## Delivery and Retries

- Respond within **15 seconds**. A timeout fails the delivery and Honeycomb does not retry it.
- Up to three retries, with a short increasing delay, on `408`, `502`, `429`/`503` with a
  `Retry-After` header, and connection-level failures. Any other `4xx` or `5xx` fails without a
  retry.
- Use `X-Honeycomb-Webhook-Delivery-ID` to deduplicate.

## Full Reference

See [Honeycomb's webhook documentation](https://docs.honeycomb.io/notify/webhooks).
