# Nexthink Webhooks Overview

## What Are Nexthink Webhooks?

Nexthink's outbound connectors let the platform call a third-party URL when an alert or event
matches the webhook's **NQL conditions**. Nexthink describes them as automated messages sent
when an event occurs, used to push alerts, incidents and other notifications to ITSM and
messaging tools. Delivery is regulated to avoid overloading the target, so it is not
immediate and can be delayed.

Webhooks carry no signature. The only authentication is the `Authorization` header from the
connector credential (see [verification.md](verification.md)). The docs describe no retry
schedule, ordering guarantee or event ID, so make handlers idempotent.

## What Does a Webhook Request Look Like?

You configure three fields on the webhook:

| Field | Meaning |
|-------|---------|
| **Request method** | `POST`, `PUT` or `PATCH` (dropdown) |
| **Resource** | Path (and `key=value` parameters) appended to the credential's URL; may contain `{{placeholders}}` |
| **Payload** | JSON only; may contain `{{variable_name}}` placeholders |

Placeholders come from the NQL data model and must match the webhook's NQL conditions, for
example `{{alert.monitor.name}}`. Adding `.as(format = text)` renders values readably.
Placeholders that cannot be filled are left as the literal `{{variable_name}}`. **Send Test**
does not substitute them either (all variables are plain strings).

## Which Events Are There?

Nexthink defines **no event-type strings** and adds no event field. Which tables can trigger a
webhook (for example `alert.alerts`, `workflow.executions`, `remote_action.executions`,
`device_performance.boots`, `web.errors`) is set by the NQL condition, and the body is whatever
template you write.

The examples therefore use an **illustrative template** (not a Nexthink format). `event` is a
field you choose:

```json
{ "event": "alert triggered", "monitor": "{{alert.monitor.name}}" }
```

| Illustrative `event` | Meaning in the example |
|----------------------|------------------------|
| `alert triggered` | An alert condition matched; the handler logs the monitor name |
| `alert recovered` | A second webhook you define for recovery; the handler logs it |

Any other body (or an empty one) is accepted and logged as unrecognised.

## Full Reference

- Webhooks: https://docs.nexthink.com/platform/configuring_nexthink/bringing-data-into-your-nexthink-instance/integrating-nexthink-with-third-party-tools/outbound-connectors/webhooks
- Connector credentials: https://docs.nexthink.com/platform/configuring_nexthink/bringing-data-into-your-nexthink-instance/integrating-nexthink-with-third-party-tools/outbound-connectors/connector-credentials
