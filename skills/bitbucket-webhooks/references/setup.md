# Setting Up Bitbucket Webhooks

## Prerequisites

- A Bitbucket Cloud account with admin access to the repository or workspace
- Your application's webhook endpoint URL (HTTPS required)

## Create a Webhook Secret

Bitbucket can generate a secret for you, or you can supply your own. To generate
one yourself:

```bash
openssl rand -hex 32
```

Store this secret securely—you'll need it in your application to verify the
`X-Hub-Signature` header. Bitbucket does not show the secret again after you save
the webhook.

## Register Your Endpoint

### Repository Webhooks

1. In Bitbucket, go to your repository
2. Click **Repository settings** → **Webhooks** (under *Workflow*)
3. Click **Add webhook**
4. Configure:
   - **Title**: A description of the webhook's purpose
   - **URL**: Your endpoint (e.g. `https://your-app.com/webhooks/bitbucket`)
   - **Secret**: Paste your secret, or click **Generate secret**
   - **Status**: Ensure **Active** is checked
   - **SSL/TLS**: Keep certificate verification enabled for production
5. Under **Triggers**, choose the events to receive:
   - **Repository push** (default), or
   - **Choose from a full list of triggers** to select specific events such as
     pull request created/updated/merged/declined
6. Click **Save**

A repository can have up to 50 webhooks.

### Workspace Webhooks

1. Click your workspace avatar → **Settings**
2. Under *Apps and features*, click **Webhooks** → **Add webhook**
3. Follow the same steps as repository webhooks

Workspace webhooks receive events from all repositories in the workspace.

## Recommended Events by Use Case

**CI/CD Pipeline:**
- `repo:push` - Trigger builds on commits
- `pullrequest:created`, `pullrequest:updated` - Run checks on PRs
- `pullrequest:fulfilled` - Deploy on merge

**PR Automation:**
- `pullrequest:created` - Assign reviewers
- `pullrequest:approved` - Merge gating
- `pullrequest:comment_created` - Bot responses

**Issue Automation:**
- `issue:created` - Triage
- `issue:comment_created` - Notifications

## Signature Header

When a secret is configured, Bitbucket signs each request and sends the
`X-Hub-Signature` header as `sha256=<hex>`. The event type is in `X-Event-Key`
and a unique delivery ID is in `X-Request-UUID`. Webhooks configured **without**
a secret are unsigned and rely on HTTPS plus a hard-to-guess endpoint URL.

## Test Webhook Delivery

After creating a webhook, use **View requests** on the webhook to inspect recent
deliveries, see the request/response, and **Redeliver** a payload. You can also
trigger events naturally by pushing commits or opening a pull request.

## Local Development

For local webhook testing, use the Hookdeck CLI:

```bash
npx hookdeck-cli listen 3000 bitbucket --path /webhooks/bitbucket
```

Use the provided URL as your webhook endpoint in Bitbucket.

## Environment Variables

Store your secret securely:

```bash
# .env
BITBUCKET_WEBHOOK_SECRET=your_webhook_secret_here
```

## Full Documentation

For complete setup instructions, see:
- [Manage webhooks](https://support.atlassian.com/bitbucket-cloud/docs/manage-webhooks/)
- [Event payloads](https://support.atlassian.com/bitbucket-cloud/docs/event-payloads/)
