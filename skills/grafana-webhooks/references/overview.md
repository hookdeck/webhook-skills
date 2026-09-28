# Grafana Webhooks Overview

## What Are Grafana Webhooks?

Grafana Alerting delivers notifications through **contact points**. The **Webhook**
contact point integration POSTs a JSON body to a URL you own whenever an alert group
changes state.

This is Grafana-managed alerting (also called "unified alerting") — the only alerting
system in Grafana 11 and later, and what Grafana Cloud runs.

### Where requests come from

- **Self-hosted Grafana:** notifications come from your own instance, so the source
  IP is whatever it egresses from.
- **Grafana Cloud:** Grafana publishes source-IP lists on its
  [allow-list page](https://grafana.com/docs/grafana-cloud/security-and-account-management/allow-list/).
  Grafana-managed alerts are sent by Hosted Grafana
  (`https://grafana.com/api/hosted-grafana/source-ips.txt`, DNS
  `src-ips.hosted-grafana.grafana.net`); data source-managed alerts go through the
  hosted Alertmanager and use the Hosted Alerts list
  (`https://grafana.com/api/hosted-alerts/source-ips.txt`, DNS
  `src-ips.hosted-alerts.grafana.net`).

Those addresses are shared by every Grafana Cloud customer, so an IP allowlist only
narrows who can reach you. It doesn't prove the request came from *your* stack, so
verify the HMAC signature as well.

### What this skill does *not* cover

| Not this | Why it's different |
|----------|--------------------|
| Grafana **legacy dashboard alerting** webhook notifier | Removed in Grafana 11. Different payload (`ruleName`, `ruleId`, `evalMatches`, `dashboardId`, `panelId`) and no HMAC signing at all. |
| Grafana **OnCall / Grafana IRM** outgoing webhooks | A separate product with its own payload templates and authentication. |
| Prometheus **Alertmanager** `webhook_config` | The payload is a close relative — Grafana's carries Alertmanager's core fields plus `orgId`, `title`, `state` and `message`, with `version` `"1"` rather than Alertmanager's `"4"` — but Alertmanager itself has no HMAC signing. |

## There Are No Event Types

Grafana sends **no event-type header and no event-type field**. There is no
`X-Grafana-Event`, no `type`, no `event` key. Every request is one notification about
one alert **group**.

Dispatch on status instead:

| Field | Values | Triggered When | Common Use Cases |
|-------|--------|----------------|------------------|
| `status` | `firing` | At least one alert in the group is firing | Open an incident, page on-call, create a ticket |
| `status` | `resolved` | Every alert in the group has resolved | Close the incident, post an all-clear |
| `state` | `alerting` | Same condition as `status: firing` | Grafana's own naming for the group state |
| `state` | `ok` | Same condition as `status: resolved` | — |
| `alerts[].status` | `firing` / `resolved` | Per individual alert instance | Per-instance fan-out, label-based routing |

**A `firing` group notification can contain `resolved` alerts.** The group status is
`firing` if *any* member is firing, so iterate `alerts[]` rather than trusting the
top-level `status` alone.

Resolved notifications can be suppressed entirely with the contact point's **Disable
resolved message** option — if you never see `resolved`, check that setting first.

## Event Payload Structure

The default body is Go `json.Marshal` output: compact, no trailing newline.

```json
{
  "receiver": "My Super Webhook",
  "status": "firing",
  "orgId": 1,
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "alertname": "High memory usage",
        "team": "blue",
        "zone": "us-1"
      },
      "annotations": {
        "description": "The system has high memory usage",
        "runbook_url": "https://myrunbook.com/runbook/1234",
        "summary": "This alert was triggered for zone us-1"
      },
      "startsAt": "2021-10-12T09:51:03.157076+02:00",
      "endsAt": "0001-01-01T00:00:00Z",
      "generatorURL": "https://play.grafana.org/alerting/1afz29v7z/edit",
      "fingerprint": "c6eadffa33fcdf37",
      "silenceURL": "https://play.grafana.org/alerting/silence/new?alertmanager=grafana&matchers=alertname%3DT2%2Cteam%3Dblue%2Czone%3Dus-1",
      "dashboardURL": "",
      "panelURL": "",
      "values": { "B": 44.23943737541908, "C": 1 }
    },
    {
      "status": "firing",
      "labels": {
        "alertname": "High CPU usage",
        "team": "blue",
        "zone": "eu-1"
      },
      "annotations": {
        "description": "The system has high CPU usage",
        "runbook_url": "https://myrunbook.com/runbook/1234",
        "summary": "This alert was triggered for zone eu-1"
      },
      "startsAt": "2021-10-12T09:56:03.157076+02:00",
      "endsAt": "0001-01-01T00:00:00Z",
      "generatorURL": "https://play.grafana.org/alerting/d1rdpdv7k/edit",
      "fingerprint": "bc97ff14869b13e3",
      "silenceURL": "https://play.grafana.org/alerting/silence/new?alertmanager=grafana&matchers=alertname%3DT1%2Cteam%3Dblue%2Czone%3Deu-1",
      "dashboardURL": "",
      "panelURL": "",
      "values": { "B": 44.23943737541908, "C": 1 }
    }
  ],
  "groupLabels": {},
  "commonLabels": { "team": "blue" },
  "commonAnnotations": {},
  "externalURL": "https://play.grafana.org/",
  "version": "1",
  "groupKey": "{}:{}",
  "truncatedAlerts": 0,
  "title": "[FIRING:2]  (blue)",
  "state": "alerting",
  "message": "**Firing**\n\nValue: B=44.23943737541908, C=1\nLabels:\n - alertname = T2\n..."
}
```

### Top-level fields

| Field | Type | Description |
|-------|------|-------------|
| `receiver` | string | Name of the contact point that delivered this notification |
| `status` | string | `firing` or `resolved` — group status |
| `orgId` | number | Grafana organization ID |
| `alerts` | array | Alert objects in this group (see below) |
| `groupLabels` | object | Labels the notification policy grouped on |
| `commonLabels` | object | Labels shared by every alert in the group |
| `commonAnnotations` | object | Annotations shared by every alert in the group |
| `externalURL` | string | External address of the Grafana instance |
| `version` | string | Payload format version — currently `"1"` |
| `groupKey` | string | Identifier for this alert group |
| `truncatedAlerts` | number | How many alerts were dropped by **Max Alerts** |
| `title` | string | Templated title (customizable) |
| `state` | string | `alerting` or `ok` |
| `message` | string | Templated message body (customizable) |

### Per-alert fields (`alerts[]`)

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `firing` or `resolved` for this instance |
| `labels` | object | Alert instance labels (`alertname` is always present) |
| `annotations` | object | Alert annotations (`summary`, `description`, `runbook_url`, …) |
| `startsAt` | string | RFC3339 timestamp the alert started firing |
| `endsAt` | string | RFC3339 end time; `"0001-01-01T00:00:00Z"` while still firing |
| `generatorURL` | string | Link to the alert rule in Grafana |
| `fingerprint` | string | Stable hash of the alert's label set |
| `silenceURL` | string | Pre-filled link to silence this alert |
| `dashboardURL` | string | Linked dashboard, or `""` |
| `panelURL` | string | Linked panel, or `""` |
| `imageURL` | string | Screenshot URL — present only when image rendering is configured |
| `values` | object | Evaluated query/expression values keyed by refId (`A`, `B`, `C`, …) |

## Custom Payloads Change Everything Above

The contact point's **Custom Payload** option replaces the body with whatever your Go
template renders — which may be pretty-printed JSON, a different shape, or not JSON at
all. The HMAC is computed over whatever bytes are actually sent, so **always verify
against the raw request body**.

## The Test Button

The contact point **Test** button sends a normal, signed notification containing a
synthetic alert: labels `alertname: TestAlert` and `instance: Grafana`, annotation
`summary: Notification test`. There is no separate handshake, challenge, or
verification request — an unsigned request is not from your Grafana instance.

## Idempotency

Grafana sends **no delivery id**. If you need a dedupe key, derive a heuristic one:

```
groupKey + ":" + status + ":" + sorted(alerts[].fingerprint + "@" + alerts[].startsAt)
```

This is a heuristic, not a guarantee — repeat notifications for an unchanged group
(Grafana's `repeat_interval`) will hash identically, which is usually what you want,
but it cannot distinguish a genuine re-notify from a redelivery.

## Full Reference

- [Webhook contact point integration](https://grafana.com/docs/grafana/latest/alerting/configure-notifications/manage-contact-points/integrations/webhook-notifier/)
- [HMAC signature](https://grafana.com/docs/grafana/latest/alerting/configure-notifications/manage-contact-points/integrations/webhook-notifier/#hmac-signature)
