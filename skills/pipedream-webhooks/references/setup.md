# Setting Up Pipedream Webhooks

## Prerequisites

- A Pipedream account with a [Connect project](https://pipedream.com/projects)
- OAuth client credentials for the Pipedream API (for deploying triggers and creating Connect tokens)
- Your application's public webhook endpoint URL

## How Do I Set a Project-Level Webhook URL?

The project URL is the default for every trigger in that environment (`development` or `production`).

**UI:**

1. Open your [project settings](https://pipedream.com/projects).
2. Under **Webhooks**, add a URL for each environment (e.g. `https://your-app.com/webhooks/pipedream`).
3. Copy the **signing key** shown when you save. Pipedream never shows it again; regenerate it if you lose it.

**API** ([Set Project Environment Webhook](https://pipedream.com/docs/connect/api-reference/set-project-environment-webhook)):

```sh
curl -X PUT https://api.pipedream.com/v1/connect/{project_id}/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {access_token}" \
  -H "x-pd-environment: production" \
  -d '{ "webhook_url": "https://your-app.com/webhooks/pipedream" }'
```

Creating the webhook returns `signing_key`; updating an existing one does not. Store it as `PIPEDREAM_WEBHOOK_SIGNING_KEY`.

## How Do I Set a Trigger-Level Webhook URL?

Pass `webhook_url` when you [deploy a trigger](https://pipedream.com/docs/connect/api-reference/deploy-trigger), or change it later with [Update Trigger Webhooks](https://pipedream.com/docs/connect/api-reference/update-trigger-webhooks). Pipedream returns a signing key in the response (for OAuth-authenticated requests). A trigger-level URL overrides the project URL, and it has **its own signing key**, so keep track of which key belongs to which URL.

```typescript
const deployedTrigger = await client.triggers.deploy({
  externalUserId: "abc-123",
  id: "gitlab-new-issue",
  configuredProps: { gitlab: { authProvisionId: "apn_kVh9AoD" }, projectId: 45672541 },
  webhookUrl: "https://your-app.com/webhooks/pipedream",
});
```

Signing keys can be read back with [Get Trigger Webhook](https://pipedream.com/docs/connect/api-reference/get-trigger-webhook) and rotated with the regenerate endpoints for [trigger](https://pipedream.com/docs/connect/api-reference/regenerate-trigger-webhook-signing-key) and [project](https://pipedream.com/docs/connect/api-reference/regenerate-webhook-signing-key) webhooks.

## How Do I Receive Connection Webhooks?

Pass `webhook_uri` when you [create a Connect token](https://pipedream.com/docs/connect/api-reference/create-connect-token). Pipedream POSTs `CONNECTION_SUCCESS` or `CONNECTION_ERROR` there at the end of that user's connect flow.

These requests are not documented as signed. The examples accept an optional secret in the URL, so create tokens with:

```
webhook_uri=https://your-app.com/webhooks/pipedream/connect?token=<PIPEDREAM_CONNECT_WEBHOOK_TOKEN>
```

## Testing

- Run a tunnel: `npx hookdeck-cli listen 3000 pipedream --path /webhooks/pipedream` (no account needed), and use the printed URL as the webhook URL.
- Deploy a trigger. By default many triggers emit a few historical events on deploy, which arrive signed at your URL; pass `emit_on_deploy: false` to suppress them.
- Use the `development` environment while testing so production URLs and keys stay separate.
