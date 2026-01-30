# Setting Up GitHub Webhooks

## Prerequisites

- GitHub account with admin access to the repository (or organization admin for org webhooks)
- Your application's webhook endpoint URL (HTTPS recommended)

## Create Webhook Secret

Generate a secure random secret for signature verification:

```bash
# Generate a random secret
openssl rand -hex 32
```

Store this secret securely—you'll need it for both GitHub configuration and your application.

## Register Your Endpoint

### Repository Webhooks

1. Go to your repository on GitHub
2. Click **Settings** → **Webhooks** → **Add webhook**
3. Configure:
   - **Payload URL**: Your endpoint (e.g., `https://your-app.com/webhooks/github`)
   - **Content type**: `application/json` (recommended)
   - **Secret**: Your generated secret
   - **SSL verification**: Enable (recommended for production)
4. Select events:
   - **Just the push event** - Only push events
   - **Send me everything** - All events
   - **Let me select individual events** - Choose specific events
5. Click **Add webhook**

### Organization Webhooks

1. Go to your organization on GitHub
2. Click **Settings** → **Webhooks** → **Add webhook**
3. Follow the same steps as repository webhooks

Organization webhooks receive events from all repositories in the organization.

### GitHub App Webhooks

For GitHub Apps:

1. Go to **Settings** → **Developer settings** → **GitHub Apps**
2. Select your app → **General** → **Webhook**
3. Configure:
   - **Webhook URL**: Your endpoint
   - **Webhook secret**: Your generated secret
4. Under **Permissions & events**, select the events to subscribe to

## Recommended Events by Use Case

**CI/CD Pipeline:**
- `push` - Trigger builds on commits
- `pull_request` - Run checks on PRs
- `workflow_run` - Post-CI automation

**Issue/PR Automation:**
- `issues` - Issue triage
- `pull_request` - PR automation
- `issue_comment` - Bot responses

**Release Management:**
- `release` - Deploy on release
- `create` / `delete` - Branch lifecycle

## Test Webhook Delivery

After creating a webhook, GitHub sends a `ping` event to verify your endpoint.

To manually test:
1. Go to your webhook settings
2. Click **Recent Deliveries**
3. Select a delivery and click **Redeliver**

Or trigger events by pushing commits, creating issues, etc.

## Local Development

For local webhook testing, use Hookdeck CLI:

```bash
hookdeck listen 3000 --path /webhooks/github
```

Use the provided URL as your webhook endpoint in GitHub.

## Environment Variables

Store your secret securely:

```bash
# .env
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
```

## Full Documentation

For complete setup instructions, see:
- [Creating Webhooks](https://docs.github.com/en/webhooks/using-webhooks/creating-webhooks)
- [Organization Webhooks](https://docs.github.com/en/webhooks/using-webhooks/creating-webhooks#creating-organization-webhooks)
