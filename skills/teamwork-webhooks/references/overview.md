# Teamwork Webhooks Overview

## What Are Teamwork Webhooks?

Teamwork.com Projects sends an HTTP POST to your URL when something happens on your site, such as a task being created or a milestone being edited. Webhooks are available on paid Teamwork.com plans and can be registered at **site level** or on an individual **project**. This skill covers **Version 2** webhooks only. Teamwork Desk and Teamwork Spaces webhooks are documented separately and are not covered.

## Common Event Types

The event name is sent in the `X-Projects-Event` header in uppercase `ENTITY.ACTION` form.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `TASK.CREATED` | A task is created | Sync tasks, add job-number prefixes |
| `TASK.UPDATED` | A task is updated | Mirror changes |
| `TASK.COMPLETED` | A task is completed | Trigger downstream actions |
| `TASK.DELETED` | A task is deleted | Remove mirrored records |
| `PROJECT.CREATED` | A project is created | Provision resources |
| `COMMENT.CREATED` | A comment is added | Forward to chat |
| `MILESTONE.COMPLETED` | A milestone is completed | Status reporting |
| `TIME.CREATED` | Time is logged | Update dashboards |

## Event Payload Structure

The body is JSON with an `eventCreator` object and the entity, keyed by its name:

```json
{
  "eventCreator": { "id": 238860, "firstName": "Marc", "lastName": "Cashman", "avatar": "https://..." },
  "project": { "id": 787076, "name": "My First Project", "status": "active", "ownerId": 238860, "companyId": 195285 }
}
```

All delete events share one payload:

```json
{ "id": 1, "projectId": 1, "eventCreator": { "id": 1, "firstName": "Holly", "lastName": "Bracken", "avatar": "https://..." } }
```

The documented samples contain no event name or event ID in the body, so dispatch on the `X-Projects-Event` header. For idempotency, key on the header plus the entity `id` and its `dateUpdated`.

## Event Families

Each entity supports a set of actions (the full list is in the docs): BUDGET, CALENDEREVENT (site level only), COMMENT, COMPANY (site level only), EXPENSE, FILE (CREATED, DELETED, DOWNLOADED, TAGGED, UNTAGGED, UPDATED), FORM, INVOICE, LINK, MESSAGE, MESSAGEREPLY, MILESTONE (COMPLETED, CREATED, DELETED, REMINDER, REOPENED, TAGGED, UNTAGGED, UPDATED), NOTEBOOK, PROJECT (ARCHIVED, COMPLETED, COPIED, CREATED, DELETED, REOPENED, TAGGED, UNTAGGED, UPDATED), RISK, ROLE, TASK (COMPLETED, CREATED, DELETED, MOVED, REMINDER, REOPENED, TAGGED, UNTAGGED, UPDATED), TASKLIST, TEAM, TIME, TIMER, USER (site level only), and others.

## Delivery Behavior

- Respond `200` within 5 seconds. Any other status, including 3xx, is a failure.
- Failed deliveries are retried once an hour, up to 3 attempts, then discarded.
- A webhook is deactivated after three or more discarded events.
- Add `fireWebhook=false` to a Teamwork API call to stop it firing a webhook (useful in tests).

## Full Event Reference

- [Setting up webhooks](https://apidocs.teamwork.com/guides/teamwork/setting-up-webhooks)
- [Webhook events](https://apidocs.teamwork.com/guides/teamwork/webhook-events)
- [Sample payloads](https://apidocs.teamwork.com/guides/teamwork/sample-webhook-payloads)
- [Responding to a webhook](https://apidocs.teamwork.com/guides/teamwork/responding-to-a-webhook)
