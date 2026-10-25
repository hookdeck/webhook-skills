# Pipeline CRM Webhooks Overview

## What Are Pipeline CRM Webhooks?

An automation in Pipeline CRM pairs a trigger (a person is added, a deal changes stage) with actions. The **Call an API** action is the webhook: a `POST` with `Content-Type: application/json` and `User-Agent: PipelineBot v1` to your URL whenever a record is created, updated or deleted. You can also subscribe a URL to one event (`event_model` × `event_action`) with the Webhooks API endpoints. Both produce the same payload.

Signed deliveries use [Standard Webhooks](https://www.standardwebhooks.com/). Signing is opt-in per endpoint; endpoints without a secret receive unsigned deliveries.

## What Events Does Pipeline CRM Send?

The payload has no single event type string. Combine `event_model` and `event_action` as `{event_model}.{event_action}`.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `deal.create` | A deal is created | Notify sales, create a project |
| `deal.update` | A deal changes (stage, value, owner) | Sync stage to billing, revenue reporting |
| `deal.destroy` | A deal is deleted | Remove the mirrored record |
| `person.create` | A person is added | Enrich or sync to a mailing list |
| `person.update` | A person changes | Keep contact data in sync |
| `person.destroy` | A person is deleted | Honour deletions downstream |
| `company.create` | A company is added | Provision accounts |
| `company.update` | A company changes | Sync company data |
| `company.destroy` | A company is deleted | Remove the mirrored record |

## Event Payload Structure

```json
{
  "trigger": "Deal stage changed",
  "timestamp": "2026-09-03 14:22:07",
  "event_model": "deal",
  "event_action": "update",
  "event_model_id": 4521,
  "event_data": { "id": 4521, "name": "Acme Corporation - Q4 renewal", "deal_stage_id": 4, "value": 12000.0, "user_id": 13 },
  "event_changes": { "deal_stage_id": [3, 4] },
  "caused_by_user": { "id": 13, "email": "sam.okafor@northwind.example", "first_name": "Sam", "last_name": "Okafor", "time_zone": "America/New_York" }
}
```

- `event_data` is the record after the change, in the API's shape (it can be switched off per endpoint).
- `event_changes` is present on updates only and maps each changed field to `[old, new]`.
- There is no event ID in the body. Use the `webhook-id` header to dedupe.

## Delivery and Retries

- Answer with any `2xx` within a few seconds; the body is ignored.
- Non-2xx, timeouts and connection errors are failures, retried with increasing delays, up to 16 attempts over roughly a day.
- `3xx` responses are not followed and not retried. Register the final URL.
- `410 Gone` stops delivery and switches the endpoint off immediately.
- Failure emails go to the endpoint's failure address (max 5 per 5 minutes, 50 per 24 hours).
- Deliveries can arrive out of order. Treat the payload as a notification and read the record back from the API when order matters.

## Full Event Reference

See [Pipeline CRM's API documentation](https://app.pipelinecrm.com/api/docs) (Automations section; the spec is at [openapi.json](https://app.pipelinecrm.com/openapi.json)).
