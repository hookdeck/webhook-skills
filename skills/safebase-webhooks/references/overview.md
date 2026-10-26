# SafeBase Webhooks Overview

## What Are SafeBase Webhooks?

SafeBase (Trust Center, now part of Drata) sends an HTTP `POST` to your endpoint when
specific events happen in your Trust Center, such as a user signing an NDA, viewing or
downloading a document, or requesting access. They are typically wired to Zapier, Slack,
Teams, ClickUp, Asana, a SIEM, or any service that can receive a webhook.

Delivery runs on [Svix](https://www.svix.com/) through an embedded App Portal, so each
request carries `svix-id`, `svix-timestamp`, and `svix-signature` headers (see
[verification.md](verification.md)). SafeBase's help article doesn't show the header
names or secret format; they are Svix defaults. All data is a JSON object.

## What Event Types Does SafeBase Send?

The exact strings below come from SafeBase's webhook configuration. The **Event Catalog**
tab in the webhook portal lists every event and the format of its data.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `accessRequest.requested` | Someone requests Trust Center access | Create a ClickUp/Asana task, notify the sales team |
| `accessRequest.blocked` | An access request is blocked | Audit trail |
| `accessRequest.autoApprove.requireManual` | An auto-approve request needs manual review | Route to an approver |
| `accounts.created` | A Trust Center account is created | CRM lead capture |
| `accounts.nda.completed` | A user completes the NDA | Slack message, store the NDA in Dropbox/Box |
| `portal.viewed` | The Trust Center is viewed | Engagement tracking |
| `portal.file.downloaded` | A document is downloaded | Notify on SOC 2 / SIG downloads, SIEM logging |
| `questionnaire.completed` | A questionnaire is completed | Update a project tracker |
| `knowledgebase.entry.created` | A Knowledge Base entry is created | Sync content |

This list is not exhaustive. Handle unknown events by logging and returning `200`.

## What Does a SafeBase Webhook Payload Look Like?

Each event has its own schema (see the Event Catalog). SafeBase doesn't document which
field holds the event name, and says that **the test event has no event name but real
events do**. The examples in this skill therefore read the name from the first string
found in `eventType`, `event_type`, `type` or `event`, and log the whole body when none
is present.

Confirm the real shape by sending an event from the **Testing** tab and checking the
**Logs** tab before relying on any field.

## How Do Retries Work?

A delivery that doesn't get a `2xx` response is retried by Svix. The **Logs** tab shows
recent deliveries and whether they succeeded. The endpoint settings also offer rate
limiting and a custom header. Deliveries are at least once, so deduplicate on the
`svix-id` header (it is the same across retries).

## Which IPs Does SafeBase Send From?

SafeBase points to Svix's published source-IP list for allow-listing:
<https://docs.svix.com/receiving/source-ips>. Signature verification is the primary
authentication; an IP allowlist is an optional extra.

## Full Event Reference

- [SafeBase: Integration - Webhooks](https://help.safebase.io/en/articles/16203084-integration-webhooks)
- [Svix: Verifying payloads](https://docs.svix.com/receiving/verifying-payloads/how)
