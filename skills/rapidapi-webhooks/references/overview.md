# RapidAPI Webhooks Overview

## What Are RapidAPI Webhooks?

Covers Enterprise Hub events only. In the RapidAPI Enterprise Hub, **Admin Panel > Events** lets
you enable event triggers and add up to five callback URLs. When an event fires in the hub,
RapidAPI sends an HTTP POST to each URL. Typical uses: sync subscriptions to a CRM or AR/AP
system, update a gateway when APIs change, post to Slack, or drive an approvals workflow.

Requests are not signed. Each one carries the hub's webhook secret key as plain text in the
`x-rapidapi-webhook-secret` header so you can confirm it came from your hub.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `API Created` | An API is created | Add it to your catalog or gateway |
| `API Updated` | An API is updated | Refresh gateway config |
| `API Deleted` | An API is deleted | Remove it from the gateway |
| `Subscription Created` | A subscription is created | Sync to CRM or billing |
| `Subscription Updated` | A subscription is updated or deleted | Update the downstream record |
| `User Created` | A user is created | Provision the user |
| `Billing Plan Updated` | A billing plan is updated | Update plan pricing |

One action fires several events. From the docs: creating an API sends `API Created`,
`API Updated`, `API Version Created`, `Billing Plan Created` and `Subscription Created`
(plus `Target Group Created` if a base URL was added).

## Other Events in the Docs

`API Version Created/Updated/Deleted`, `Billing Plan Created/Deleted`, `User Updated/Deleted`,
`Team Created/Updated/Deleted`, `App Created/Updated/Deleted`, `App Key Created/Updated/Deleted`,
`Organization Created/Updated/Deleted`, `API Endpoint Created/Updated/Deleted`,
`Target Group Created/Updated/Deleted` (Base URL), `Documentation Created/Updated/Deleted`,
approvals, announcements, discussions, messages and jobs. The docs list a few in
`UPPER.CASE` form (`BILLINGPLAN.UPDATED`, `WORKFLOW.CREATED`, `DISCUSSION_COMMENT.CREATED`),
so do not assume one naming style; confirm with a **Test event**.

## Event Payload Structure

The body format is not documented. The docs only say an HTTP POST payload is sent. Use the
**Test event** link next to an event in the Admin Panel to obtain a real sample request, and
**Event logs > Details** to inspect past requests and responses. Don't assume a field name until
you've checked a sample. Example payloads in this skill are illustrative.

## Full Event Reference

See [RapidAPI Events / Webhooks](https://docs.rapidapi.com/docs/events).
