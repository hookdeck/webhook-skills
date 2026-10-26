# Chili Piper Webhooks Overview

## What Are Chili Piper Webhooks?

Chili Piper (meeting scheduling and inbound lead routing) can push booked-meeting data to URLs you choose, for reporting, data warehouses or triggering automations. These are **custom webhooks**, created in the Command Center's Integrations pane. You can create as many as you like; several webhook types can share a URL, and one type can have several URLs.

Each webhook is bound to one action type, chosen when you create it. The request body carries the same choice in its `type` field.

## Common Event Types

| `type` | Webhook type | Triggered When | Common Use Cases |
|--------|--------------|----------------|------------------|
| `Created` | For New Meeting | Every new meeting booked, from any source | Create a CRM activity, notify the host |
| `Updated` | For Meeting Update | A meeting is updated, for example reassigned or rescheduled | Sync the new time or assignee |
| `Deleted` | For Canceled Meeting | A user or prospect cancels the meeting, via any source | Remove the CRM activity, free the slot |

## Event Payload Structure

Fields from the Chili Piper docs (example values may differ from real data):

| Field | Meaning |
|-------|---------|
| `meetingIdChili` | Unique meeting ID (UUID) |
| `meetingTitle`, `meetingDescription`, `meetingLocation` | Derived from the Meeting Type |
| `meetingStartTime`, `meetingEndTime` | ISO 8601 UTC, for example `2025-03-21T20:30:00Z` |
| `primaryGuestTimeZone` | IANA time zone of the primary guest |
| `hostEmail`, `hostFullName`, `hostIdChili` | Meeting host |
| `assigneeEmail`, `assigneeFullName`, `assigneeIdChili` | Assignee |
| `primaryGuestEmail`, `primaryGuestDataFields` | Prospect and guest form fields (`{string: string}`) |
| `additionalGuests` | Array of `{ email, fullName }` |
| `bookerEmail`, `bookerName`, `bookerIdChili` | Who booked |
| `workspaceName`, `workspaceIdChili` | Workspace |
| `productFeatureType`, `productFeatureName`, `productFeatureIdChili` | Source of the meeting, for example `ConciergeRouter`, `HandoffRouter`, `RoundRobinSchedulingLink`, `ChatPlaybook`, `DistroRouter`, `OwnershipSchedulingLink` (list may not be complete) |
| `distributionName`, `distributionIdChili` | Distribution used |
| `meetingTypeName`, `meetingTypeIdChili` | Meeting Type used to book |
| `type` | `Created`, `Updated` or `Deleted` |

## Delivery

- Method: `POST` with a JSON body.
- Headers: `X-Chili-Signature` and `X-Chili-Timestamp` (see [verification.md](verification.md)).
- Signing is optional on Chili Piper's side but recommended for any endpoint that triggers automations or writes data.
- Retry behavior and expected response codes are not documented. Respond `2xx` quickly and de-duplicate on `meetingIdChili` plus `type`.

## Full Event Reference

See the [Chili Piper Custom Webhook Configuration article](https://help.chilipiper.com/hc/en-us/articles/39402611091475-Custom-Webhook-Configuration). The page sits behind a Cloudflare challenge; its content is also available from `https://help.chilipiper.com/api/v2/help_center/en-us/articles/39402611091475.json`.
