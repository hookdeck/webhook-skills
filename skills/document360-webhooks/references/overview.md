# Document360 Webhooks Overview

## What Are Document360 Webhooks?

Document360's **Webhook notification channel** pushes a structured JSON payload to a URL of your
choice whenever a mapped knowledge base event happens. You create the channel under
**Settings > Knowledge base portal > Notifications**, then map events to it on the
**Notification mapping** tab. All events are off by default, and you can run several channels,
each mapped to different events.

Requests are **not signed**. The only authentication is a header you add to the channel as a
key-value pair; your endpoint checks it. The request method is your choice (POST or PUT), and the
body format comes from the channel's **Request content** dropdown.

## Common Event Types

The payload's `Event` field holds the display name of the event.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `Article published` | An article is published and available to readers | Notify the docs team, reindex search |
| `Article created` | A new article is created | Track new content |
| `Article deleted` | An article is deleted | Purge caches using `Slugs` |
| `Article settings saved` | Article settings are saved (name from the docs' sample payload; the mapping list calls it "Article settings updated") | Re-sync metadata |
| `Article workflow status updated` | An article or category moves in or out of a workflow status | Trigger n8n, Make or Zapier |
| `Extension token deleted` | An extension token is deleted | Alert the integration owner |

Document360 also fires events for categories, Drive files and folders, workspaces, API and
extension tokens, site settings, redirect rules and more. See the full list in the
[notification mapping docs](https://docs.document360.com/docs/notification-mapping). Display names
are exact strings with spaces; compare them as written.

## Event Payload Structure

Keys are display labels with spaces, not snake_case. Article events carry:

| Field | Description |
|-------|-------------|
| `Knowledge base name` | Name of the knowledge base project |
| `Event` | The action that triggered the webhook, e.g. `Article published` |
| `User` / `User email` | The team member who performed the action |
| `Logged on (UTC)` | Date and time of the action in UTC (e.g. `09/12/2025 06:15:00`) |
| `Article name` / `Article id` | The affected article |
| `Language` / `Language code` | The article's language |
| `Project version id` / `Project version name` | The knowledge base version |

`Article deleted` adds `Slugs`, an array of `{ "language", "slug" }` for every language the
article had. Non-article events replace the article fields with their own, for example
`Extension` (extension token events), `Widget setting name` or `Folder name`. Fields that don't
apply are omitted.

```json
{
  "Knowledge base name": "Document360 2.0",
  "Event": "Extension token deleted",
  "User": "Matt Sterling",
  "User email": "matt.sterling@document360.co",
  "Logged on (UTC)": "09/12/2025 06:47:10",
  "Extension": "MAKE"
}
```

## Full Event Reference

- [Webhook notification channel](https://docs.document360.com/docs/webhook-notification-channel)
- [Notification mapping](https://docs.document360.com/docs/notification-mapping)
