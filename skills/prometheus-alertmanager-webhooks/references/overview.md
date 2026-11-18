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

Alertmanager documents the version `"4"` body as a format description rather than a filled-in
example. This is its format, as printed in the `webhook_config` docs:

```
{
  "version": "4",
  "groupKey": <string>,              // key identifying the group of alerts (e.g. to deduplicate)
  "truncatedAlerts": <int>,          // how many alerts have been truncated due to "max_alerts"
  "status": "<resolved|firing>",
  "receiver": <string>,
  "groupLabels": <object>,
  "commonLabels": <object>,
  "commonAnnotations": <object>,
  "externalURL": <string>,           // backlink to the Alertmanager.
  "notification_reason": <string>,   // string represent the reason this notification was generated
  "alerts": [
    {
      "status": "<resolved|firing>",
      "labels": <object>,
      "annotations": <object>,
      "startsAt": "<rfc3339>",
      "endsAt": "<rfc3339>",
      "generatorURL": <string>,      // identifies the entity that caused the alert
      "fingerprint": <string>        // fingerprint to identify the alert
    },
    ...
  ]
}
```

- `truncatedAlerts` is the number of alerts dropped because the receiver's `max_alerts` is set.
- `labels` hold `alertname` and whatever labels your alerting rules set; `annotations` hold text
  such as a summary or runbook link.

## Repeated Notifications

Alertmanager notifies per group: after `group_wait` it sends the first notification, at each
`group_interval` it sends again if the group changed, and it repeats an unchanged notification
after `repeat_interval`. Each notification carries the whole group, so the same alert arrives many
times. Key your handling on each alert's `fingerprint`, `status` and `startsAt`, as the examples do,
not on `groupKey` alone: a group's firing and resolved notifications share the same `groupKey`.

## Full Reference

See the [Alertmanager configuration docs](https://prometheus.io/docs/alerting/latest/configuration/)
(`webhook_config`) for every option.
