# Humaans Webhooks Overview

## What Are Humaans Webhooks?

Humaans is an HR information system (HRIS). Webhooks notify your systems as things happen in Humaans, so you don't have to poll the API. An Owner creates a webhook on the Humaans webhooks page (or through the API), sets the endpoint URL and the events to subscribe to, and **publishes** it. Until it is published the endpoint receives nothing. Deliveries are signed with a `whsec_` secret using the Standard Webhooks scheme (delivered via Svix).

## Common Event Types

The event wrapper's `action` field holds the event type. These are the actions listed in Humaans' documentation:

| Event (`action`) | Triggered when | Common use cases |
|------------------|----------------|------------------|
| `person.created` | A person is added | Create accounts, start onboarding workflows |
| `person.updated` | A person's profile changes | Sync directory and payroll data |
| `person.offboarded` | A person is offboarded | Revoke access, trigger leaver checklists |
| `person.reonboarded` | An offboarded person returns | Re-enable accounts |
| `person.deleted` | A person is deleted | Remove stored copies |
| `timeAway.created` | A time away request is created | Notify managers |
| `timeAway.updated` | A time away request changes | Update calendars |
| `timeAway.deleted` | A time away request is deleted | Clear calendar entries |
| `timeAway.approved` | A time away request is approved | Update calendars, payroll, Slack status |
| `timeAway.rejected` | A time away request is rejected | Notify the requester |
| `timeAwayAdjustment.created` / `.updated` / `.deleted` | A time away balance adjustment changes | Keep balances in sync |
| `compensation.created` / `.updated` / `.deleted` | A compensation record changes | Payroll sync (see `entity.metadata` for the compensation type) |
| `bankAccount.created` / `.updated` / `.deleted` | Bank account details change | Payroll sync |
| `jobRole.created` / `.updated` / `.deleted` | A job role changes | Org chart and permissions sync |
| `emergencyContact.created` / `.updated` / `.deleted` | An emergency contact changes | Safety and compliance records |
| `equipment.created` / `.updated` / `.deleted` | Equipment assignments change | IT asset tracking |

## Event Payload Structure

```json
{
  "id": "qCNHkhApepOJf0eFHuPzQbDg",
  "seq": "01J4GSN4XYQ7401FXCYQPWH3V7",
  "ts": "2024-08-05T08:14:24.190Z",
  "action": "emergencyContact.created",
  "subject": { "id": "8Rc7dFxm7OFoiwxVBIFrLRAi", "type": "person" },
  "actor": { "personId": "8Rc7dFxm7OFoiwxVBIFrLRAi", "type": "person" },
  "entity": {
    "id": "OCPMqZtTcgFOuoc56TiKo9OT",
    "fieldsChanged": ["name", "email"],
    "next": { "name": "jane", "email": "jd@humaans.io" },
    "prev": { "name": null, "email": null },
    "customFields": [],
    "metadata": {}
  }
}
```

| Field | Description |
|-------|-------------|
| `id` | Unique ID of the event |
| `seq` | Sortable sequence string; use it to order events |
| `ts` | When the event was created |
| `action` | The event type, e.g. `person.created` |
| `subject` | The affected participant (`id`, `type`) |
| `actor` | The affecting participant; may be an integration |
| `entity.id` | ID of the affected entity |
| `entity.fieldsChanged` | Fields that changed, including custom field IDs |
| `entity.next` / `entity.prev` | New and previous values (`null` when unset or newly set) |
| `entity.customFields` | Changed custom fields |
| `entity.metadata` | Extra context, e.g. the compensation type on `compensation.updated` |

## Delivery Behaviour

- Any `2xx` response is a success. Any other response is a failure and is retried with exponential backoff.
- If every attempt to an endpoint fails for 5 days, the endpoint is disabled. The clock starts only after multiple deliveries have failed within 24 hours, with at least 12 hours between the first and last failure.
- Events come only from these addresses: `52.215.16.239`, `54.216.8.72`, `63.33.109.123` and `2a05:d028:17:8000::/52`. Treat this as an extra check, not a replacement for signature verification.
- Retries reuse the same `webhook-id`. Use it to deduplicate.

## Full Event Reference

See [Humaans' webhook documentation](https://docs.humaans.io/api/#webhooks).
