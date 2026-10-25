# Auvik Webhooks Overview

## What Are Auvik Webhooks?

Auvik is a network monitoring platform. Its Webhook integration (configured from the MSP
dashboard) posts a JSON alert notification to a URL you choose whenever an alert is triggered or
cleared. Requests are not signed. With **Header** authentication, Auvik adds a custom HTTP header
(Key and Value) that you define, so your endpoint can confirm the request came from your Auvik
integration.

## Common Event Types

The alert state is in `alertStatusString`.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `Triggered` | A monitoring alert fires | Open an incident or ticket, page on-call |
| `Cleared` | An alert clears | Resolve the incident or ticket |

## Event Payload Structure

The default body:

```json
{
  "alertId": "1234",
  "alertName": "Device offline",
  "alertStatus": 0,
  "alertStatusString": "Triggered",
  "alertDescription": "Switch is unreachable",
  "entityName": "core-switch-01",
  "companyName": "Acme MSP",
  "date": "2026-10-25T10:00:00.000Z",
  "link": "https://example.auvik.com/alert/1234"
}
```

- `alertStatus` is numeric (`0` or `1`); `alertStatusString` is the readable `Triggered` or `Cleared`.
- More fields can be present; read the ones you need and ignore the rest.
- An optional JSONata expression on the integration can reshape the body. If you use one, keep
  `alertStatusString` (or adapt the handler) so events can still be told apart.
- The example values above are illustrative.

## Full Event Reference

See Auvik's [Integrating Auvik with a webhook](https://support.auvik.com/hc/en-us/articles/216977386-Integrating-Auvik-with-a-webhook) article.
