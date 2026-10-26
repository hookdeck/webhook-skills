# incident.io Webhooks Overview

## What Are incident.io Webhooks?

incident.io sends an HTTP `POST` to your endpoint when incidents, follow-ups, alerts, escalations,
on-call schedules or status page incidents change. You create endpoints and choose events under
**Settings → Webhooks**. Delivery runs on Svix and follows the Standard Webhooks spec (`webhook-id`,
`webhook-timestamp`, `webhook-signature`); see [verification.md](verification.md).

These are not the same as workflow "HTTP request" steps, which you configure per workflow, which send
whatever body you template and which leave from separate integration IP ranges.

## What Does the Payload Look Like?

Every body has two keys. The second key's **name is the event type string**, dots included:

```json
{
  "event_type": "public_incident.incident_created_v2",
  "public_incident.incident_created_v2": {
    "id": "01FDAG4SAP5TYPT98WGR2N7W91",
    "reference": "INC-123",
    "name": "Our database is sad",
    "visibility": "public",
    "incident_status": { "name": "Closed", "category": "triage" },
    "severity": { "name": "Minor" }
  }
}
```

- Route on `body.event_type`. No header carries the event type.
- Read the resource from `body[body.event_type]` (bracket access in JavaScript). There is no `data`,
  `payload` or `object` key.

### Why Do Private Events Only Have an `id`?

For private incidents, alerts and escalations incident.io sends only the resource id, so private details
don't leak to systems that shouldn't see them:

```json
{
  "event_type": "private_incident.incident_created_v2",
  "private_incident.incident_created_v2": { "id": "abc123" }
}
```

To get the details, call the incident.io API with an API key that has private incident access. Code that
reads `.name` or `.summary` from a private event gets `undefined` (or crashes on nested fields).
`private_incident.membership_granted_v1` and `private_incident.membership_revoked_v1` are the exception:
they carry `incident_id`, `user_id` and `actor_user_id`.

## Event Types

All 34 names below come from the machine-readable spec at
<https://docs.incident.io/openapi/webhooks.json>. The `_vN` suffix is part of the name.

### Incidents (public)

| Event | Triggered When |
|-------|----------------|
| `public_incident.incident_created_v2` | A new incident is created |
| `public_incident.incident_updated_v2` | An incident is updated |
| `public_incident.incident_status_updated_v2` | An incident's status changes (payload: `incident`, `previous_status`, `new_status`, `message`) |
| `public_incident.action_created_v1` | A follow-up is created (older naming) |
| `public_incident.action_updated_v1` | A follow-up is updated (older naming) |
| `public_incident.follow_up_created_v1` | A follow-up is created |
| `public_incident.follow_up_created_v2` | A follow-up is created (v2 payload adds `title`, `priority`, `labels`, `creator`, `assignee_team`) |
| `public_incident.follow_up_updated_v1` | A follow-up is updated |
| `public_incident.follow_up_updated_v2` | A follow-up is updated (v2 payload) |
| `public_incident.postmortem_document_status_updated_v1` | A postmortem's status is updated |

### Incidents (private, id only unless noted)

| Event | Triggered When |
|-------|----------------|
| `private_incident.incident_created_v2` | A private incident is created |
| `private_incident.incident_updated_v2` | A private incident is updated |
| `private_incident.action_created_v1` | A follow-up on a private incident is created (older naming) |
| `private_incident.action_updated_v1` | A follow-up on a private incident is updated (older naming) |
| `private_incident.follow_up_created_v1` | A follow-up on a private incident is created |
| `private_incident.follow_up_created_v2` | A follow-up on a private incident is created |
| `private_incident.follow_up_updated_v1` | A follow-up on a private incident is updated |
| `private_incident.follow_up_updated_v2` | A follow-up on a private incident is updated |
| `private_incident.membership_granted_v1` | A user is given access to a private incident (`incident_id`, `user_id`, `actor_user_id`) |
| `private_incident.membership_revoked_v1` | A user's access to a private incident is revoked (`incident_id`, `user_id`, `actor_user_id`) |
| `private_incident.postmortem_document_status_updated_v1` | A postmortem's status on a private incident is updated |

### Alerts

| Event | Triggered When |
|-------|----------------|
| `public_alert.alert_created_v1` | A new alert is created |
| `public_alert.alert_resolved_v1` | An alert is resolved |
| `private_alert.alert_created_v1` | A new private alert is created (id only) |
| `private_alert.alert_resolved_v1` | A private alert is resolved (id only) |

### Escalations

| Event | Triggered When |
|-------|----------------|
| `public_escalation.escalation_created_v1` | An escalation is created |
| `public_escalation.escalation_status_updated_v1` | An escalation changes status (`escalation`, `previous_status`, `new_status`, `actor`) |
| `private_escalation.escalation_created_v1` | A private escalation is created (id only) |
| `private_escalation.escalation_status_updated_v1` | A private escalation changes status (id only) |

### Schedules (on-call)

| Event | Triggered When |
|-------|----------------|
| `schedule.created_v1` | A schedule is created |
| `schedule.updated_v1` | A schedule's configuration is updated |
| `schedule.deleted_v1` | A schedule is deleted |
| `schedule.shift_change_v1` | The on-call user(s) on a schedule change (`schedule`, `current_users`, `previous_users`) |

### Status pages

| Event | Triggered When |
|-------|----------------|
| `status_page_incident.update_shared_v1` | An update is posted on a status page incident, including the one that publishes it (`status_page_incident`, `update`) |

### Asymmetries Worth Knowing

- `public_incident.incident_status_updated_v2` has **no** private counterpart.
- The `membership_granted_v1` / `membership_revoked_v1` pair exists **only** on the private side.
- `action_*_v1` and `follow_up_*_v1` have the same description in the spec ("whenever a follow-up is
  created/updated"). `action_*` is the older name for the same concept. incident.io hasn't published a
  deprecation date. Subscribing to both may give you two notifications for one follow-up change.

## Delivery Semantics

- **Acknowledge with 2xx** (200 or 204). Anything else is retried with exponential backoff over 24 hours.
  An endpoint that keeps failing for 5 days is disabled and your team is emailed.
- **Order isn't guaranteed.** incident.io recommends treating a webhook as a change notification:
  receive it, fetch the current state from the API, and store that.
- **Deduplicate on `webhook-id`**; the same message can arrive more than once.
- **Replay** missed messages from the Svix app portal under Settings → Webhooks.

## Full Event Reference

- [Webhooks guide](https://docs.incident.io/integrations/webhooks)
- [Webhooks API reference](https://docs.incident.io/api-reference/webhooks)
- [Machine-readable event spec](https://docs.incident.io/openapi/webhooks.json)
