# Act-On Webhooks Overview

## What Are Act-On Webhooks?

[Act-On](https://www.act-on.com) is a marketing automation platform. Its outgoing webhooks send real-time data to external systems such as Slack, Teams or your own database. They are managed in an embedded Svix portal in Act-On (**Settings > Connectors > Custom Integrations > Outgoing Webhooks**), with Endpoints, Event Catalog, Testing and Logs tabs. Act-On exclusively supports `POST`.

Every delivery is signed. The signing headers are the Svix defaults (`svix-id`, `svix-timestamp`, `svix-signature`) and the secret is a `whsec_` Signing Secret. Act-On's pages don't spell this out; they only say the payload carries an HMAC SHA-256 signature and the Signing Secret is generated automatically.

## What Does a Payload Look Like?

Each body is the event's own object. **There is no event-type field**; the type exists only in Svix's message metadata. Subscribe each endpoint to the events it should receive, or use one endpoint per event type. The examples in this skill infer the type from the payload's shape.

```json
{
  "contact": { "E-mail Address": "johndoe@example.com", "First Name": "John", "Company": "Act-On" },
  "contactReportLink": "https://example.actonsoftware.com/acton/ng-ui/contact?email=johndoe@example.com",
  "email": "johndoe@example.com",
  "timestamp": 1689343863
}
```

## Which Events Does Act-On Send?

Event names are exactly as in Act-On's Event Catalog (dots and hyphens as shown).

| Event | Triggered when | Payload fields |
|-------|----------------|----------------|
| `contact.added` | A contact is added to Act-On Contacts | `contact`, `contactReportLink`, `email`, `timestamp` |
| `contact.updated` | A contact is updated | Same as `contact.added` |
| `contact-bounce.hard` | A contact joins the hard bounce list | `bounceDiagnostic`, `categoryReason`, `email`, `isHardBounce`, `msgId`, `timestamp` |
| `contact-bounce.soft` | A contact joins the soft bounce list | `email`, `isHardBounce` |
| `contact-email.marked-as-spam` | A contact marks an email as spam | `email`, `msgId`, `recId`, `srcId`, `timestamp` |
| `contact-lead-score.upper-threshold-surpassed` | A contact's lead score first exceeds a configured value | `contactReportLink`, `crmLink`, `email`, `fields`, `leadScore`, `scoresheetId` |
| `contact-opt.global-opt-in` | A contact opts in to all email | `email`, `hasOptedOut` (false), `timestamp` |
| `contact-opt.global-opt-out` | A contact opts out of all email | `email`, `hasOptedOut` (true), `timestamp` |
| `form.submitted` | A configured Form is submitted | `browser`, `campaignSource`, `contact`, `cookieId`, `formId`, `formName`, `referrer`, `submissionTime` |
| `automated-program.started` | An Automated Program starts | `description`, `entryType`, `link`, `name`, `programSchedule`, `startedTime`, `waitingCount` |
| `automated-program.stopped` | An Automated Program stops | Same, with `stoppedTime` instead of `startedTime` |
| `subscription-category.opt-in` | A contact opts in to a subscription category | `categoryChecked` (true), `categoryDescription`, `categoryId`, `categoryName`, `email`, `timestamp` |
| `subscription-category.opt-out` | A contact opts out of a subscription category | Same, with `categoryChecked` false |
| `subscription-category.added` | A contact adds a subscription category | `checked`, `description`, `id`, `name`, `timestamp` |
| `subscription-category.deleted` | A contact deletes a subscription category | Same as `.added` |
| `subscription-category.updated` | A contact updates a subscription category | Same as `.added` |
| `crm.connected` | A user connects a CRM | `crmDisplayName`, `detail`, `timestamp` |
| `crm.disconnected` | A user disconnects a CRM | Same as `crm.connected` |
| `email-message.scheduled` | An email message is scheduled | `accountId`, `accountName`, `creatorId`, `creatorName`, `messageId`, `numTargetedRecipients`, `previewText`, `scheduledTimeZone`, `scheduledTimestamp`, `schedulingOfEmail`, `selectedSender`, `subject`, `title` |

Slack and Teams have preconfigured variants (`automated-program.started.slack`, `automated-program.stopped.slack`, `automated-program.started.teams`, `automated-program.stopped.teams`) whose payloads are formatted for those platforms. They are meant for Slack and Teams incoming webhooks, not for a signature-verifying handler.

## Which Events Can't Be Told Apart By Shape?

| Shared shape | Events |
|--------------|--------|
| `contact`, `contactReportLink`, `email`, `timestamp` | `contact.added`, `contact.updated` |
| `crmDisplayName`, `detail`, `timestamp` | `crm.connected`, `crm.disconnected` |
| `checked`, `description`, `id`, `name`, `timestamp` | `subscription-category.added`, `.deleted`, `.updated` |

Use one endpoint per event type for these. Two more notes from Act-On's own examples: the `contact-bounce.soft` example shows `"isHardBounce": true`, which looks like a copy of the hard bounce example, so distinguish soft from hard by the absence of `msgId`/`categoryReason` rather than the flag's value; and `contact-opt.global-opt-in`/`-out` carry `hasOptedOut` as `false`/`true`.

## Special Requirements

- `form.submitted` needs additional setup: configure each Form that should trigger a webhook on submission.
- `contact-lead-score.upper-threshold-surpassed` must be activated by Act-On technical support. It checks for score changes every 5 minutes.
- Each webhook is limited to 10 channels (for example 10 Form IDs or Program IDs). Create more webhooks for more.

## Full Event Reference

- [Outgoing Webhook Event Types](https://connect.act-on.com/hc/en-us/articles/20031106799383-Outgoing-Webhook-Event-Types)
- [Outgoing Webhook Management](https://connect.act-on.com/hc/en-us/articles/20031498483479-Outgoing-Webhook-Management)
