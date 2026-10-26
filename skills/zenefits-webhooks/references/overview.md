# TriNet Zenefits Webhooks Overview

## What Are Zenefits Webhooks?

Zenefits (now described in its docs as TriNet's HR platform) lets partner applications subscribe to changes in the HR platform. Events are sent as a `POST` to the HTTPS URLs you provide during integration setup. The payload carries the relevant data, including information the user entered into your modules.

Your endpoint must return a `2xx` status to acknowledge receipt. Anything else, including `3xx`, counts as not received, and Zenefits retries for up to 1 hour. Delivery may happen more than once, so handlers must be idempotent. Store the payload, respond quickly, and process in the background.

## Common Event Types

Event names follow `object.action.subtype` (subtype only exists for some events) and arrive in the payload's `type` field.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `companies.did_create` | A company object is created | Rare: companies already exist when they install your app |
| `companies.did_change` | A company object changes | Sync company details |
| `people.did_create` | A new person is created | Provision a user record |
| `people.did_change` | A person object changes | Sync profile, manager, department |
| `employments.did_start` | A person's first day of work (`employment.hire_date`) | Create the person's account |
| `employments.will_start` | The day before the start date | Pre-provisioning |
| `employments.did_terminate` | A person's last day of work (`employment.termination_date`) | Deactivate the account |
| `flow.did_complete.hiring` | An admin completes a hiring flow | Start onboarding in your service |

Other documented events follow the same `*.did_create` / `*.did_change` pattern: `employments`, `banks`, `company_banks`, `departments`, `locations`, `equal_employment_opportunities`, `labor_groups`, `labor_group_types`, `custom_fields`, `custom_field_values`, `time_durations`, `vacation_requests`, `vacation_types`. Platform events marked internal in the docs include `person_subscriptions.did_enable`, `person_subscriptions.did_disable`, `company_installs.did_uninstall`, `company_installs.should_sync_install`, and `flow.did_complete.onboarding`, `.termination`, `.employment_change`. Always switch on the payload's `type` field.

## Event Payload Structure

```json
{
  "object": "/meta/event",
  "type": "flow.did_complete.hiring",
  "data": { "id": "1", "object": "/platform/flows", "type": "hiring", "url": "https://api.trinet.com/platform/flows/1" }
}
```

- `object` is always `/meta/event`
- `type` is the event name
- `data` matches the REST API representation of the object (for example `GET /platform/flows`)

## Full Event Reference

See the [Zenefits webhooks documentation](https://developers.zenefits.com/docs/webhooks) and the [events list](https://developers.zenefits.com/reference/events).
