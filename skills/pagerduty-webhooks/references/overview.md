# PagerDuty Webhooks Overview

## What Are PagerDuty Webhooks?

PagerDuty **V3 webhooks** are outbound HTTP POSTs that PagerDuty sends when
incidents and services change — triggered, acknowledged, escalated, reassigned,
resolved, annotated, and so on. You create a **webhook subscription** via
`POST https://api.pagerduty.com/webhook_subscriptions`, choose which event types
you care about and a filter (service, team or account), and PagerDuty delivers
one event per request to your URL.

Source: [Webhooks Overview](https://docs.pagerduty.com/developer/webhooks-overview).

### Which generation is this?

| | Status |
|---|---|
| **V3 webhook subscriptions** | **Current and only supported generation.** This document. |
| V2 webhook extensions | Legacy. End-of-support 31 Oct 2022; still functioning (no EOL date set) but no fixes or features. `messages[]` array payload with event strings like `incident.trigger` (singular, no `d`). **Not** signed with `X-PagerDuty-Signature`. |
| V1 webhook extensions | Not covered — EOL October 2022, they no longer function. |
| Events API v1/v2 (`events.pagerduty.com`) | Not webhooks. These are **inbound to PagerDuty** — you send alerts and change events *to* PagerDuty. Opposite direction. |

A [migration guide](https://docs.pagerduty.com/integrations/webhooks#migration-guide)
and a [migration script](https://github.com/PagerDuty/public-support-scripts/tree/master/migrate_webhooks_to_v3)
exist for moving V1/V2 extensions to V3 subscriptions.

## Event Payload Structure

Each V3 payload contains a **single** `event` object. The outer fields are
common to every event; the inner `event.data` differs by `event.event_type`.

| Field | Type | Description |
|---|---|---|
| `event` | Object | The event that triggered the webhook. |
| `event.id` | String | The unique id of the event. |
| `event.event_type` | String | The type of the event, e.g. `incident.priority_updated`. **Route on this.** |
| `event.resource_type` | String | The root resource type (leftmost part of `event_type`) — currently `incident` or `service`. **Can differ from the more specific `data.type`.** |
| `event.occurred_at` | DateTime | An ISO 8601 datetime indicating when the event occurred. |
| `event.agent` | [Resource Reference](https://docs.pagerduty.com/developer/resource-references) or `null` | Who or what initiated the event. A `null` value might indicate an event triggered via automation rather than a specific person. |
| `event.client` | Object or `null` | Information about where the event was triggered, e.g. `{"name": "PagerDuty"}`. |
| `event.data` | Object | Data specific to the `event_type`. Carries its own `type` discriminator. |

**`agent` and `client` can both be `null`** — the documented `service.updated`
example has both. Never write `event.agent.id` without a guard.

### Example: `incident.priority_updated`

```json
{
  "event": {
    "id": "5ac64822-4adc-4fda-ade0-410becf0de4f",
    "event_type": "incident.priority_updated",
    "resource_type": "incident",
    "occurred_at": "2020-10-02T18:45:22.169Z",
    "agent": {
      "html_url": "https://acme.pagerduty.com/users/PLH1HKV",
      "id": "PLH1HKV",
      "self": "https://api.pagerduty.com/users/PLH1HKV",
      "summary": "Tenex Engineer",
      "type": "user_reference"
    },
    "client": {
      "name": "PagerDuty"
    },
    "data": {
      "id": "PGR0VU2",
      "type": "incident",
      "self": "https://api.pagerduty.com/incidents/PGR0VU2",
      "html_url": "https://acme.pagerduty.com/incidents/PGR0VU2",
      "number": 2,
      "status": "triggered",
      "incident_key": "d3640fbd41094207a1c11e58e46b1662",
      "created_at": "2020-04-09T15:16:27Z",
      "reopened_at": "2020-10-02T18:45:22Z",
      "title": "A little bump in the road",
      "service": {
        "html_url": "https://acme.pagerduty.com/services/PF9KMXH",
        "id": "PF9KMXH",
        "self": "https://api.pagerduty.com/services/PF9KMXH",
        "summary": "API Service",
        "type": "service_reference"
      },
      "assignees": [
        {
          "html_url": "https://acme.pagerduty.com/users/PTUXL6G",
          "id": "PTUXL6G",
          "self": "https://api.pagerduty.com/users/PTUXL6G",
          "summary": "User 123",
          "type": "user_reference"
        }
      ],
      "escalation_policy": {
        "html_url": "https://acme.pagerduty.com/escalation_policies/PUS0KTE",
        "id": "PUS0KTE",
        "self": "https://api.pagerduty.com/escalation_policies/PUS0KTE",
        "summary": "Default",
        "type": "escalation_policy_reference"
      },
      "teams": [
        {
          "html_url": "https://acme.pagerduty.com/teams/PFCVPS0",
          "id": "PFCVPS0",
          "self": "https://api.pagerduty.com/teams/PFCVPS0",
          "summary": "Engineering",
          "type": "team_reference"
        }
      ],
      "priority": {
        "html_url": "https://acme.pagerduty.com/account/incident_priorities",
        "id": "PSO75BM",
        "self": "https://api.pagerduty.com/priorities/PSO75BM",
        "summary": "P1",
        "type": "priority_reference"
      },
      "urgency": "high",
      "conference_bridge": {
        "conference_number": "+1 1234123412,,987654321#",
        "conference_url": "https://example.com"
      },
      "resolve_reason": null
    }
  }
}
```

### Example: `service.updated` (note the `null`s)

```json
{
  "event": {
    "id": "01BRB6ZP4M6T8ZG4X6BP63ZB9O",
    "event_type": "service.updated",
    "resource_type": "service",
    "occurred_at": "2021-03-02T13:35:11.682Z",
    "agent": null,
    "client": null,
    "data": {
      "html_url": "https://acme.pagerduty.com/services/PF9KMXH",
      "id": "PF9KMXH",
      "self": "https://api.pagerduty.com/services/PF9KMXH",
      "summary": "testing service updates",
      "alert_creation": "create_alerts_and_incidents",
      "teams": [
        {
          "html_url": "https://acme.pagerduty.com/teams/PFCVPS0",
          "id": "PFCVPS0",
          "self": "https://api.pagerduty.com/teams/PFCVPS0",
          "summary": "Engineering",
          "type": "team_reference"
        }
      ],
      "type": "service"
    }
  }
}
```

## Common Event Types

The complete V3 list. PagerDuty: *"Additional event types may be added to this
list over time"*, plus unannounced
[Early Access events](https://docs.pagerduty.com/developer/early-access-webhooks)
that are "subject to change at any moment, without notice" — **always keep a
default branch and never throw on an unrecognised `event_type`.**

### Incident lifecycle

| Event | `data.type` | Triggered when | Common use cases |
|---|---|---|---|
| `incident.triggered` | `incident` | An incident is newly created/triggered | Page a bot, open a war room, post to Slack |
| `incident.acknowledged` | `incident` | An incident is acknowledged | Start MTTA timers, update a status page |
| `incident.unacknowledged` | `incident` | An incident is unacknowledged | Re-alert, escalate |
| `incident.resolved` | `incident` | An incident is resolved | Close the war room, record MTTR |
| `incident.reopened` | `incident` | An incident is reopened | Reopen the linked ticket |
| `incident.escalated` | `incident` | Escalated to another user in the **same** escalation level | Notify the next responder |
| `incident.delegated` | `incident` | Reassigned to another **escalation policy** | Hand off between teams |
| `incident.reassigned` | `incident` | Reassigned to another **user** | Update ownership |
| `incident.priority_updated` | `incident` | The priority of an incident changed | Re-route by severity, SLA timers |
| `incident.service_updated` | `incident` | The **service** of an incident changed (**underscore**, not a dot) | Re-route ownership |
| `incident.incident_type.changed` | `incident` | The incident type changed | Re-classify |

### Incident annotations and responders

| Event | `data.type` | Triggered when | Common use cases |
|---|---|---|---|
| `incident.annotated` | `incident_note` | A note is added to an incident (**not** `incident.note.created`) | Mirror notes into chat or a ticket |
| `incident.conference_bridge.updated` | `incident_conference_bridge` | Conference bridge number and/or URL is updated | Share the bridge link |
| `incident.custom_field_values.updated` | `incident_field_values` | Incident custom field values are updated | Sync a CMDB |
| `incident.status_update_published` | `incident_status_update` | A status update is added to an incident | Push to a public status page |
| `incident.responder.added` | `incident_responder` | A responder is added to an incident | Notify the person, track engagement |
| `incident.responder.replied` | `incident_responder` | A responder replies to a request | Track accept/decline |
| `incident.role.assigned` | `incident_role_assignment` | An incident role is assigned **or unassigned** | Maintain the roster of IC/comms lead |

### Incident tasks, actions and workflows

| Event | `data.type` | Triggered when |
|---|---|---|
| `incident.task.created` | `incident_task` | An incident task is created |
| `incident.task.updated` | `incident_task` | An incident task is updated |
| `incident.task.completed` | `incident_task` | An incident task is completed |
| `incident.action_invocation.created` | `incident_action_invocation` | An incident action invocation is created |
| `incident.action_invocation.updated` | `incident_action_invocation` | An incident action invocation is updated |
| `incident.action_invocation.terminated` | `incident_action_invocation` | An incident action invocation is terminated |
| `incident.workflow.started` | `incident_workflow_instance` | An incident workflow starts |
| `incident.workflow.completed` | `incident_workflow_instance` | An incident workflow completes |

### Services

| Event | `data.type` | Triggered when |
|---|---|---|
| `service.created` | `service` | A service is created |
| `service.updated` | `service` | A service is updated |
| `service.deleted` | `service` | A service is deleted |
| `service.custom_field_values.updated` | `service_field_values` | A service's custom field values are updated |

### Not subscribable: `pagey.ping`

`pagey.ping` is **not** in the list above and cannot be put in a subscription's
`events` array, but it *will* arrive. Calling
[`POST /webhook_subscriptions/{id}/ping`](https://docs.pagerduty.com/developer/api/reference/rest/webhooks/test-webhook-subscription)
(scope `webhook_subscriptions.write`) returns `202` and, in PagerDuty's words,
*"if properly configured, this will deliver the `pagey.ping` webhook event to
the destination"*. It is a real signed delivery — which makes it the cheapest
end-to-end test of your verification path — carrying a `resource_type` and
`data` shape unlike any documented event. **It has to fall through your default
branch**, not throw.

### Scoped OAuth read scopes

| Events | Scope |
|---|---|
| All `incident.*` except `incident.workflow.*` | `incidents.read` |
| `incident.workflow.started`, `incident.workflow.completed` | `incident_workflows.read` |
| All `service.*` | `services.read` |

### Naming traps

- `incident.service_updated` (**underscore**) is the incident's service
  changing. `service.updated` is the service object itself changing. Two
  different events.
- `incident.role.assigned` covers **unassignment** too — check
  `incident_role_assignments[].status` and `old_assignee`.
- The note event is `incident.annotated`, **not** `incident.note.created`.
- V2 extensions used `incident.trigger` / `incident.acknowledge` /
  `incident.resolve` (singular). V3 uses the past tense:
  `incident.triggered` / `incident.acknowledged` / `incident.resolved`. Don't
  mix the two vocabularies.

## Event Data Types

`event.data` is one of these objects, selected by `event.event_type`. Each
carries its own `type` discriminator.

### `incident`

Key fields: `id`, `type`, `self`, `html_url`, `number`, `status`
(`triggered` | `acknowledged` | `resolved`), `incident_key`, `created_at`,
`reopened_at`, `title`, `incident_type.name`, `service`, `assignees[]`,
`escalation_policy`, `teams[]`, `priority` (**can be `null`** when no priority
is set), `urgency` (`high` | `low`),
`conference_bridge.{conference_number, conference_url}`, `resolve_reason`.

```json
{
  "id": "PGR0VU2",
  "type": "incident",
  "self": "https://api.pagerduty.com/incidents/PGR0VU2",
  "html_url": "https://acme.pagerduty.com/incidents/PGR0VU2",
  "number": 2,
  "status": "triggered",
  "incident_key": "d3640fbd41094207a1c11e58e46b1662",
  "created_at": "2020-04-09T15:16:27Z",
  "reopened_at": "2020-10-02T18:45:22Z",
  "title": "A little bump in the road",
  "incident_type": { "name": "major" },
  "service": { "id": "PF9KMXH", "summary": "API Service", "type": "service_reference" },
  "assignees": [{ "id": "PTUXL6G", "summary": "User 123", "type": "user_reference" }],
  "escalation_policy": { "id": "PUS0KTE", "summary": "Default", "type": "escalation_policy_reference" },
  "teams": [{ "id": "PFCVPS0", "summary": "Engineering", "type": "team_reference" }],
  "priority": { "id": "PSO75BM", "summary": "P1", "type": "priority_reference" },
  "urgency": "high",
  "conference_bridge": {
    "conference_number": "+1 1234123412,,987654321#",
    "conference_url": "https://example.com"
  },
  "resolve_reason": null
}
```

### `incident_note`

```json
{
  "incident": { "id": "PGR0VU2", "summary": "A little bump in the road", "type": "incident_reference" },
  "id": "P2LA89X",
  "content": "I sure am glad we are using PagerDuty!",
  "trimmed": false,
  "type": "incident_note"
}
```

### `incident_conference_bridge`

Note `conference_numbers` is an **array of `{label, number}`** here — unlike the
single `conference_bridge.conference_number` string on an `incident`.

```json
{
  "incident": { "id": "PGR0VU2", "summary": "Major incident", "type": "incident_reference" },
  "conference_numbers": [{ "label": "", "number": "+1-555-555-5555" }],
  "conference_url": "https://example.com",
  "type": "incident_conference_bridge"
}
```

### `incident_field_values`

Carries both the full `custom_fields[]` and the subset that changed in
`changed_custom_fields[]` (with the **new** values).

```json
{
  "incident": { "id": "PBAZLIU", "summary": null, "type": "incident_reference" },
  "custom_fields": [
    { "data_type": "string", "field_type": "single_value", "id": "PICFVXX", "name": "environment", "namespace": "incidents", "type": "field_value", "value": "production" }
  ],
  "changed_custom_fields": [
    { "data_type": "string", "field_type": "single_value", "id": "PICFVXX", "name": "environment", "namespace": "incidents", "type": "field_value", "value": "staging" }
  ],
  "type": "incident_field_values"
}
```

### `incident_role_assignment`

The only data type whose payload is an **array wrapper**: the assignments live
in `incident_role_assignments[]`, each with `assignee`, `old_assignee` (can be
`null`), `role`, `status` and `incident`. An *unassignment* arrives here too.

```json
{
  "type": "incident_role_assignment",
  "incident_role_assignments": [
    {
      "assignee": { "id": "P75B6QD", "summary": "User 1810194", "type": "user_reference" },
      "id": "af64b84c-137e-40c6-875c-5dd30a2afaaa",
      "incident": { "id": "PBAZLIU", "summary": null, "type": "incident_reference" },
      "old_assignee": null,
      "role": { "id": "P8PQO4R", "summary": "Role Display Name", "type": "role_reference" },
      "status": "active",
      "type": "role_assignment_reference"
    }
  ]
}
```

### `incident_status_update`

```json
{
  "incident": { "id": "PGR0VU2", "summary": "A little bump in the road", "type": "incident_reference" },
  "id": "P2LA89X",
  "message": "A fix for this incident is being developed",
  "trimmed": false,
  "type": "incident_status_update"
}
```

### `incident_responder`

`state` is `pending` on `incident.responder.added` and carries the reply on
`incident.responder.replied`.

```json
{
  "incident": { "id": "PGR0VU2", "summary": "A little bump in the road", "type": "incident_reference" },
  "user": { "id": "PVMGSML", "summary": "Maeve", "type": "user_reference" },
  "escalation_policy": { "id": "PJFWPEP", "summary": "The Policy", "type": "escalation_policy_reference" },
  "message": "Please help me make the tests pass",
  "state": "pending",
  "type": "incident_responder"
}
```

### `incident_task`

```json
{
  "name": "A thing that needs to be done",
  "description": "A description of the task",
  "id": "PGR0VU2",
  "summary": "A thing that needs to be done",
  "type": "incident_task",
  "status": "todo",
  "assignees": [{ "id": "PIV35G6", "summary": "User 661768438", "type": "user_reference" }],
  "incident": { "id": "Q0SDD3HB6SGFTI", "summary": null, "type": "incident_reference" }
}
```

### `incident_workflow_instance`

```json
{
  "id": "P3SNKQS",
  "type": "incident_workflow_instance",
  "summary": "A Workflow Instance Name",
  "incident_workflow": { "id": "PSFEVL7", "summary": "A Workflow Name", "type": "incident_workflow_reference" },
  "workflow_trigger": { "id": "4ad696eb-bb48-422a-8bd0-6efad6befa29", "summary": "Trigger Name", "type": "workflow_trigger_reference" },
  "incident": { "id": "PBAZLIU", "summary": "A little bump in the road", "type": "incident_reference" },
  "service": { "id": "PF9KMXH", "summary": "A service", "type": "service_reference" }
}
```

### `incident_action_invocation`

```json
{
  "id": "01CELD6T9C2JS745I7CAK0LRRF",
  "self": "https://api.pagerduty.com/automation/invocations/01CELD6T9C2JS745I7CAK0LRRF",
  "html_url": "https://acme.pagerduty.com/rundeck-actions/actions/01CDYN0IRV4VG991K5FR73YNTW/invocations/01CELD6T9C2JS745I7CAK0LRRF/report",
  "incident": { "id": "PBAZLIU", "summary": "An Incident", "type": "incident_reference" },
  "action": { "id": "01CDYN0IRV4VG991K5FR73YNTW", "summary": "A Helpful Action", "type": "action_reference" },
  "state": "created",
  "type": "incident_action_invocation"
}
```

### `service`

```json
{
  "html_url": "https://acme.pagerduty.com/services/PF9KMXH",
  "id": "PF9KMXH",
  "self": "https://api.pagerduty.com/services/PF9KMXH",
  "summary": "testing service updates",
  "alert_creation": "create_alerts_and_incidents",
  "teams": [{ "id": "PFCVPS0", "summary": "Engineering", "type": "team_reference" }],
  "type": "service"
}
```

### `service_field_values`

Same shape as `incident_field_values` but keyed on `service`. Note its
`changed_custom_fields[]` entries in PagerDuty's documented example show the
**old** value, so don't rely on the direction — read `custom_fields[]` for
current state.

```json
{
  "service": { "id": "PY0TW31", "summary": null, "type": "service_reference" },
  "custom_fields": [
    { "data_type": "string", "field_type": "multi_value", "id": "P0CU101", "name": "string_multi_example_1", "type": "field_value", "value": ["1", "2"] },
    { "data_type": "string", "field_type": "single_value", "id": "P7DNIMB", "name": "example_field", "type": "field_value", "value": "Some new value" }
  ],
  "changed_custom_fields": [
    { "data_type": "string", "field_type": "single_value", "id": "P7DNIMB", "name": "example_field", "type": "field_value", "value": "Some old value" }
  ],
  "type": "service_field_values"
}
```

## Delivery Behaviour

Source: [Behaviour](https://docs.pagerduty.com/developer/webhook-behavior).

### Timeouts

PagerDuty expects a **2xx within 5 seconds** for generic webhooks and within
**16 seconds** for webhooks generated from Custom Incident Actions. PagerDuty's
own recommendation: *"Return a `202 Accepted` once you receive a payload and
then process the batch of webhooks. Asynchronous processing will help prevent
the connection from timing out."*

### Retries and permanent failures

Retried **for up to 48 hours**, then dropped:

- No response / timeout
- 5xx response
- 429 response
- Connection cannot be established (except for most TLS errors)
- TLS certificate **expired** errors
- DNS errors / host name cannot be resolved

Dropped **without** a retry:

- Any other 4xx response (everything except 429)
- TLS errors when establishing a connection (except expired certificates)
- A 401 after a successful OAuth token refresh

**This is why a signature rejection must be a 4xx.** Return 5xx for a forged
request and PagerDuty retries it for two days.

### Head-of-line blocking

While a webhook is being retried, subsequent webhooks for **that subscription
and resource id** are queued for delivery. One slow or failing incident can
stall its own stream.

### Temporary disablement

After **3 consecutive dropped** webhooks — from permanent errors or from
temporary errors that exhausted their retries — the subscription is **disabled
for 24 hours** and any other webhooks in its queue are dropped. While disabled,
no new webhooks are enqueued. Re-enable it from the webhooks dashboard (it is
tagged **"Needs Attention"**) or via the "Enable a webhook subscription" REST
endpoint.

### Ordering

PagerDuty sends webhooks for a given subscription and incident combination in
the order they were generated.

### At-least-once delivery and idempotency

Duplicates are possible. PagerDuty: *"Customers wishing to de-duplicate webhooks
may do so by using the `X-Webhook-Id` header provided with each webhook request.
The value of this header is unique to the webhook but is repeated for each
delivery attempt, so it may be used to ignore subsequent delivery attempts after
an initial success."*

- **De-duplicate on `X-Webhook-Id`.** `event.id` also works, but `X-Webhook-Id`
  is the documented de-duplication key.
- **Retain processed ids for at least 48 hours** — the length of the retry
  window.
- There is **no** documented `X-PagerDuty-Event` header, no delivery-timestamp
  header, and no documented V3 User-Agent value. Don't key behaviour on headers
  that aren't documented.

### No batching

*"V3 webhook payloads will only ever contain a single webhook event by design."*
(V1 and V2 payloads had a `messages` array, but each still carried one event.)

### Size limit

- **Up to 55 KB (56320 bytes):** delivery and ordering guaranteed.
- **Over 55 KB:** PagerDuty attempts to omit event details to shrink the
  payload. The affected fields are on the **first `log_entry`** in the `channel`
  object: `details`, `cef_details.details` and `body`. (`body` appears only on
  events received by email; `cef_details.details` only on
  [PD-CEF](https://docs.pagerduty.com/developer/api/pd-cef) events.) The omitted
  field is replaced with a message noting the omission, and `channel` fields
  `details_omitted`, `cef_details.details_omitted` and `body_omitted` flip from
  `false` to `true`.
- **55 KB – 256 KB:** best-effort. May not be delivered, or may be delivered
  out of order.
- **Over 256 KB:** always dropped.

If your framework or proxy caps request body size, **the cap must be at least
256 KB** — a 100 KB limit would reject legitimate large incident payloads.

### Regions

| Region | REST API host | Webhook sender CN |
|---|---|---|
| US | `api.pagerduty.com` | `webhooks.pagerduty.com` |
| EU | `api.eu.pagerduty.com` | `webhooks.eu.pagerduty.com` |

Same signing scheme in both.

### Ports and schemes

Any publicly accessible web server, any port, with or without encryption.
`http://` connects on port 80, `https://` on 443; override by appending
`:port` to the host — `https://app.example.com:8443/pagerduty`. HTTPS is
strongly preferred.

## Full Event Reference

- [Webhooks Overview](https://docs.pagerduty.com/developer/webhooks-overview) — event types table and every `event.data` shape
- [Early Access webhook events](https://docs.pagerduty.com/developer/early-access-webhooks)
- [Behaviour](https://docs.pagerduty.com/developer/webhook-behavior) — timeouts, retries, ordering, size limits
- [Verifying Signatures](https://docs.pagerduty.com/developer/verifying-webhook-signatures)
- [Create a webhook subscription](https://docs.pagerduty.com/developer/api/reference/rest/webhooks/create-webhook-subscription)
