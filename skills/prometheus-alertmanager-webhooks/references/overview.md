# Prometheus Alertmanager Webhooks Overview

## What Are Alertmanager Webhooks?

Alertmanager groups alerts sent by Prometheus and routes them to receivers. A receiver with a
`webhook_configs` entry POSTs a JSON notification to your URL whenever a group fires, changes or
resolves. Requests are not signed; the receiver's `http_config` can add an `Authorization` header
(`authorization` with the default Bearer type, or `basic_auth`) so you can confirm the sender.

## Statuses (There Are No Event Types)

The payload has no event-type field. `status` is a state:

| Status | Where | Meaning | Common Use Cases |
|--------|-------|---------|------------------|
| `firing` | group and each alert | The alert is active | Page on-call, open an incident |
| `resolved` | group and each alert | The alert is no longer active (sent while `send_resolved` is true, the default) | Close the incident |

The group `status` is `firing` while at least one alert in it is firing, so a group can contain
both firing and resolved alerts. Loop over `alerts[]` and use each alert's own `status`.

## Event Payload Structure

Version `"4"` JSON, sent with POST:

```json
{
  "version": "4",
  "groupKey": "{}:{alertname=\"HighCPU\"}",
  "truncatedAlerts": 0,
  "status": "firing",
  "receiver": "hookdeck",
  "groupLabels": { "alertname": "HighCPU" },
  "commonLabels": { "alertname": "HighCPU", "severity": "critical" },
  "commonAnnotations": { "summary": "CPU above 90%" },
  "externalURL": "http://alertmanager:9093",
  "alerts": [
    {
      "status": "firing",
      "labels": { "alertname": "HighCPU", "instance": "web-1:9100" },
      "annotations": { "summary": "CPU above 90%" },
      "startsAt": "2026-10-26T10:00:00.000Z",
      "endsAt": "0001-01-01T00:00:00Z",
      "generatorURL": "http://prometheus:9090/graph?g0.expr=cpu",
      "fingerprint": "1a2b3c4d5e6f7a8b"
    }
  ]
}
```

- `truncatedAlerts` is the number of alerts dropped because the receiver's `max_alerts` is set.
- `endsAt` is the zero time (`0001-01-01T00:00:00Z`) while an alert is firing without an end time.

## Repeated Notifications

Alertmanager re-sends a group every `group_interval` when it changes and every `repeat_interval`
while it keeps firing, so the same alert arrives many times. Deduplicate with `groupKey` plus each
alert's `fingerprint`; add `status`, `startsAt` and `endsAt` to the key if a resolved notification
should count as new.

## Full Reference

See the [Alertmanager configuration docs](https://prometheus.io/docs/alerting/latest/configuration/)
(`webhook_config`) for every option.
