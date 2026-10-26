# KnowBe4 Webhooks Overview

## What Are KnowBe4 Webhooks?

KnowBe4 has two webhook features, both of which post JSON to a URL you choose:

- **KSAT console webhooks** (limited to Platinum, Diamond and SAT Advanced customers) send
  real-time phishing and training data to other applications, for example a data analysis
  platform such as Splunk.
- **PhishER webhooks** connect PhishER to other platforms. After you create a PhishER action with
  **Send to Webhook**, the reported messages affected by that action are sent to the webhook.

Requests are not signed. The admin can add a custom header (Key and Value) to either kind of
webhook, and that header is how your endpoint recognises KnowBe4. See
[verification.md](verification.md).

## Event Types and Groups

KnowBe4 does not publish a list of event-type strings. In KSAT you select events from three groups
in the webhook's **Events** field (tick a whole group, or open the drop-down to pick events):

| Group | Notes |
|-------|-------|
| Phishing Events | Includes `Phish Failure Removed` (the UI label used as an example in KnowBe4's docs) |
| Training Events | Training-related events |
| General Events | General account events |

For PhishER there is no event name: the webhook fires when a PhishER action with **Send to
Webhook** runs, and carries message data for the **Available Data** types you selected. The
`Addresses` type sends all email addresses on the message (From, To, CC, Reply To, Reported By).

The `Phish Failure Removed` payload includes the email address of the admin who removed the
failure (from a user's timeline or from **Phishing Campaign Overview > Users**), or the
impersonation email address when the removal happened while impersonating another admin.

## Payload Structure

The body is JSON but isn't documented field by field, and there is no vendor event field. Admins
can add **Custom Data** key/values to the payload, for example `{"System": "KnowBe4"}`. The body
is therefore defined by your own configuration.

The examples in this skill use an **illustrative** payload, not a KnowBe4 schema:

```json
{
  "event_type": "Phish Failure Removed",
  "System": "KnowBe4"
}
```

Capture a real delivery (for example with `npx hookdeck-cli listen 3000 knowbe4 --path /webhooks/knowbe4`)
and adapt the handler to the fields you actually receive.

## Delivery

- KSAT retries a failed request up to three more times, 15 minutes apart.
- A KSAT webhook that receives more than 1,000 failed responses in an hour is deactivated. Fix the
  endpoint, then set the status back to **Active** in Account Settings.
- With **Enable Webhook Failure Notifications**, recipients get an email when the webhook reaches
  50 percent of the allowed failures in an hour, and another if it is deactivated.
- The HTTP method isn't stated; the examples accept `POST`.
- PhishER can tag each message with a success or failure tag depending on whether the webhook call
  worked.

## Full Reference

- [Webhooks in Your KnowBe4 Console](https://support.knowbe4.com/hc/en-us/articles/10103021848723-Webhooks-in-Your-KnowBe4-Console)
- [Create and Manage Webhooks in Your PhishER Platform](https://support.knowbe4.com/hc/en-us/articles/14196559482387-Create-and-Manage-Webhooks-in-Your-PhishER-Platform)
