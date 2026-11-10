# Honeybadger Webhooks Overview

## What Are Honeybadger Webhooks?

Honeybadger's Webhook integration (Team, Business and Enterprise plans) posts a JSON payload to
a URL you choose whenever something happens in a project. It covers error monitoring, uptime
monitoring, check-ins and deploys. Requests are not signed; each one carries a
`Honeybadger-Token` header derived from the project API key so you can confirm it came from
Honeybadger.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `occurred` | An error occurs | Page on-call, open a ticket |
| `resolved` | An error is marked as resolved | Close the ticket |
| `unresolved` | A resolved error occurs again | Reopen the ticket |
| `assigned` | An error is assigned to a user | Notify the assignee |
| `commented` | A comment is added to an error | Sync comments |
| `rate_exceeded` | The error rate threshold is exceeded | Escalate |
| `volume_spike` | Error volume spikes above its learned baseline | Escalate |
| `deployed` | A deployment is recorded | Annotate dashboards |
| `down` | An uptime check fails | Start an incident |
| `up` | An uptime check succeeds after being down | Resolve the incident |
| `cert_will_expire` | An SSL certificate is about to expire | Renew the certificate |
| `check_in_missing` | An expected check-in is missing | Alert on a stalled job |
| `check_in_reporting` | A missing check-in reports again | Clear a missing alert |
| `alarm_alert` | An Insights alarm is triggered | Start an incident |
| `alarm_ok` | An Insights alarm returns to normal | Resolve the incident |

## Event Payload Structure

Every payload is a JSON object with:

- `event` - the event type from the table above
- `message` - a human-readable description
- event-specific objects:

| Events | Top-level properties |
|--------|----------------------|
| `occurred`, `rate_exceeded` | `event`, `message`, `project`, `fault`, `notice`, `context` |
| `resolved`, `unresolved` | `event`, `message`, `actor`, `fault` |
| `assigned` | `event`, `message`, `actor`, `fault`, `assignee` |
| `commented` | `event`, `message`, `actor`, `fault`, `comment` |
| `deployed` | `event`, `message`, `project`, `deploy` |
| `down`, `up` | `event`, `message`, `project`, `site`, `outage` |
| `cert_will_expire` | `event`, `message`, `project`, `site` |
| `check_in_missing`, `check_in_reporting` | `event`, `message`, `project`, `check_in` |
| `volume_spike` | `event`, `message`, `project`, `volume_spike` |
| `alarm_alert`, `alarm_ok` | `event`, `message`, `alarm` |

`actor` (the person who caused the event) is optional and absent when Honeybadger, or an API
token with no user, did it. These are the v2 bodies, the default payload version. Each event's
page links a JSON Schema you can validate against.

Example `alarm_alert` payload (from the docs):

```json
{
  "event": "alarm_alert",
  "message": "[Billing API] ALERT: Checkout errors is in alert status",
  "alarm": {
    "name": "Checkout errors",
    "state": "alarm",
    "created_at": "2026-10-21T12:36:26.448717Z",
    "id": "opticon-observer-root-id",
    "url": "https://app.honeybadger.io/projects/85736/insights/alarms/opticon-observer-root-id",
    "details_url": "https://app.honeybadger.io/projects/85736/insights/alarms/opticon-observer-root-id"
  }
}
```

## Delivery

Any 2xx response counts as delivered, and a 5xx is retried. Any other response, a timeout or a
refused connection turns the integration off, and Honeybadger emails the account about it. The
docs give no timeout length or retry schedule.

## Full Event Reference

See [Honeybadger's webhook documentation](https://docs.honeybadger.io/guides/integrations/webhook/)
and the [v2 payloads](https://docs.honeybadger.io/guides/integrations/payloads/v2/).
