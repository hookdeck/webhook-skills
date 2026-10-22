# Confluence Data Center Webhooks Overview

## What Are Confluence Webhooks?

Confluence Data Center administrators can define webhooks that notify an external application when events occur in Confluence. A webhook is one or more events plus a URL; Confluence POSTs the event payload as JSON to that URL.

**Scope:** this covers Confluence Data Center admin webhooks only. Confluence Cloud does not have them; Cloud apps use Connect/app webhooks authenticated with JWTs, which are not covered here.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `page_created` | A page is published for the first time (including from a template or blueprint) | Index new content, notify a channel |
| `page_updated` | A page is edited (when unpublished changes are published) | Re-sync search index, audit |
| `page_removed` | A page is deleted (sent to the trash) | Remove from downstream systems |
| `page_trashed` | A page is purged from the trash | Permanent cleanup |
| `page_restored` | A page is restored from the trash | Re-index |
| `page_moved` | A page moves in the tree, to another parent, or to another space | Update navigation |
| `blog_created` | A blog post is published | Announcements |
| `blog_updated` | A blog post is edited | Re-sync |
| `comment_created` | A page, inline, or file comment is made | Notifications |
| `space_created` | A new space is created | Provisioning |
| `space_removed` | A space is deleted | Cleanup |

Other documented events: `attachment_created`, `attachment_removed`, `attachment_restored`, `attachment_trashed`, `attachment_updated`, `blog_removed`, `blog_restored`, `blog_trashed`, `blueprint_page_created`, `comment_removed`, `comment_updated`, `content_created`, `content_restored`, `content_trashed`, `content_updated`, `content_permissions_updated`, `group_created`, `group_removed`, `label_added`, `label_created`, `label_deleted`, `label_removed`, `page_children_reordered`, `space_logo_updated`, `space_permissions_updated`, `space_updated`, `theme_enabled`, `user_created`, `user_deactivated`, `user_followed`, `user_reactivated`, `user_removed`.

## Event Payload Structure

The `event` field names the event. Payloads are mostly IDs so that identifiable information isn't leaked to third-party services; use the Confluence Data Center REST API to resolve them. Example for `page_trashed`:

```json
{
  "timestamp": 1596182511300,
  "event": "page_trashed",
  "userKey": "ff80818154ec9913015501e194f601d8",
  "page": { "id": 309264476 }
}
```

## Circuit Breaking

A webhook that fails five times is considered unhealthy and is skipped, initially for 10 seconds and then for gradually longer periods up to 10 hours. Webhooks may also be skipped while 500 are already in flight. Return a 2xx quickly and process asynchronously.

## Full Event Reference

See [Managing webhooks](https://confluence.atlassian.com/doc/managing-webhooks-1021225606.html) in the Confluence Data Center documentation.
