# Setting Up Jira Webhooks

## Prerequisites

- A Jira Cloud site with **Jira admin** access (admin webhooks are created in
  Jira administration or with the admin webhooks REST API)
- Your application's publicly reachable HTTPS webhook endpoint URL (port 80 is
  not allowed)

The examples in this skill verify **admin webhooks** that have a `secret`. Those
are the webhooks Jira signs with `X-Hub-Signature`. Webhooks owned by a Connect
or OAuth 2.0 app use an `Authorization` JWT instead. See
[App webhooks](#app-webhooks-connect--oauth-20) below and
[verification.md](verification.md).

Generate a strong random secret first and store it in your app's environment as
`JIRA_WEBHOOK_SECRET`. **You can't view or retrieve the secret after the webhook
is saved. If you lose it, set a new one.**

## Option A — Admin webhook in Jira administration (signed with a secret)

1. Go to **Jira Settings → System → WebHooks** (`/plugins/servlet/webhooks`).
2. Click **Create a WebHook**.
3. Set the **Name** and **URL** (your HTTPS endpoint).
4. Enter your **secret**, or use **Generate secret** and copy the value into
   `JIRA_WEBHOOK_SECRET`.
5. Optionally add a **JQL** filter to scope which issues fire the webhook.
6. Select the **events** to receive (Issue: created / updated / deleted,
   Comment: created / updated / deleted, etc.).
7. Save.

To add a secret to an existing webhook, or rotate it, edit the webhook. Any
integration using the old secret must be updated.

## Option B — Admin webhook via REST (`/rest/webhooks/1.0/webhook`)

This registers the same kind of admin webhook, so it is signed the same way when
you pass `secret`. Call it as a Jira admin. Atlassian's example uses basic auth
(`--user username:password`); on Jira Cloud that means your Atlassian account
email and an API token:

```bash
curl -X POST \
  'https://your-domain.atlassian.net/rest/webhooks/1.0/webhook' \
  --user 'you@example.com:<api_token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "my app webhook",
    "url": "https://your-app.example.com/webhooks/jira",
    "events": [
      "jira:issue_created",
      "jira:issue_updated",
      "jira:issue_deleted",
      "comment_created",
      "comment_updated"
    ],
    "filters": {
      "issue-related-events-section": "project = PROJ"
    },
    "excludeBody": false,
    "secret": "<your JIRA_WEBHOOK_SECRET>"
  }'
```

The response includes `"isSigned": true` when a secret is set. To change the
secret later, `PUT .../rest/webhooks/1.0/webhook/{webhookId}` with a new
`secret`. Passing `null` or `""` removes it, and omitting the field leaves it
unchanged.

Jira will now send `POST` requests to your URL with an
`X-Hub-Signature: sha256=<hex>` header. Verify it against your secret. See
[verification.md](verification.md).

> **Imported webhooks:** admin webhooks with a secret that were imported from
> another site or instance may not be delivered until you rotate the secret.

## App webhooks (Connect / OAuth 2.0)

Apps can also receive webhooks, but these are **not** signed with
`X-Hub-Signature` and this skill's examples don't verify them:

- **Connect apps** declare webhooks in the app descriptor. Jira signs deliveries
  with the app's `sharedSecret` as a Connect JWT in the `Authorization` header.
- **OAuth 2.0 (3LO) apps** register dynamic webhooks with
  `POST /rest/api/3/webhook` (see the
  [webhooks REST reference](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-webhooks/) for the
  required scopes). That request has no `secret` field. Deliveries carry a
  bearer JWT in the `Authorization` header, signed with the app's client
  secret. Dynamic webhooks expire after 30 days unless refreshed with the
  Extend webhook life API (`PUT /rest/api/3/webhook/refresh`).
- Connect apps can also register dynamic webhooks through that endpoint. The
  webhooks docs don't say how those deliveries are authenticated.

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
