# Setting Up Jira Webhooks

## Prerequisites

- A Jira Cloud site, and either:
  - **Jira admin access** (to create a webhook in the UI), or
  - A **Connect or OAuth 2.0 (3LO) app** with the `manage:jira-webhook` scope (to register dynamic webhooks via the REST API)
- Your application's publicly reachable HTTPS webhook endpoint URL

There are two ways to register a Jira webhook. Only the REST API method
(**dynamic webhooks**) produces **signed** requests.

## Option A — Dynamic webhook via REST API (signed, recommended)

Dynamic webhooks are registered by Connect / OAuth 2.0 apps and are signed with
HMAC-SHA256 when you provide a `secret`.

1. Generate a strong random secret and store it in your app's environment as
   `JIRA_WEBHOOK_SECRET`. **You cannot retrieve the secret after registration —
   if you lose it, you must register a new webhook.**

2. Register the webhook (OAuth 2.0 apps use a bearer token in the
   `Authorization` header):

   ```bash
   curl -X POST \
     'https://api.atlassian.com/ex/jira/{cloudid}/rest/api/3/webhook' \
     -H 'Authorization: Bearer <access_token>' \
     -H 'Content-Type: application/json' \
     -d '{
       "url": "https://your-app.example.com/webhooks/jira",
       "webhooks": [
         {
           "jqlFilter": "project = PROJ",
           "events": [
             "jira:issue_created",
             "jira:issue_updated",
             "jira:issue_deleted",
             "comment_created",
             "comment_updated"
           ]
         }
       ]
     }'
   ```

   Provide the secret in the registration request so Jira signs deliveries.
   Dynamic webhooks expire after 30 days unless refreshed with the
   `PUT .../webhook/refresh` endpoint.

3. Jira will now send `POST` requests to your URL with an
   `X-Hub-Signature: sha256=<hex>` header. Verify it against your secret — see
   [verification.md](verification.md).

## Option B — Webhook via the Jira UI (unsigned)

1. Go to **Jira Settings → System → WebHooks** (`/plugins/servlet/webhooks`).
2. Click **Create a WebHook**.
3. Set the **Name** and **URL** (your HTTPS endpoint).
4. Optionally add a **JQL** filter to scope which issues fire the webhook.
5. Select the **events** to receive (Issue: created / updated / deleted,
   Comment: created / updated / deleted, etc.).
6. Save.

> UI webhooks are **not signed**. To get a shared secret you can check, append a
> hard-to-guess query parameter to the URL, e.g.
> `https://your-app.example.com/webhooks/jira?secret=<random>`, and compare it in
> your handler. Always use HTTPS.

## Selecting Events

Recommended starting set for issue automation:

- `jira:issue_created`
- `jira:issue_updated`
- `jira:issue_deleted`
- `comment_created`
- `comment_updated`

## Testing

- Use the [Hookdeck CLI](https://hookdeck.com/docs/cli) to tunnel webhooks to
  your local machine: `npx hookdeck-cli listen 3000 jira --path /webhooks/jira`.
- Trigger real events by creating/editing/transitioning an issue or adding a
  comment in your Jira site.
