# Setting Up GitLab Webhooks

## Prerequisites

- GitLab project with Maintainer or Owner access
- Your application's webhook endpoint URL (e.g., `https://api.example.com/webhooks/gitlab`)
- GitLab 19.0 or later for signing tokens (GitLab.com has them; generally available in 19.1)

## Choose How GitLab Authenticates Requests

GitLab offers two options, and you can configure both on the same webhook:

- **Signing token (recommended).** GitLab signs every request with an HMAC-SHA256
  signature following the [Standard Webhooks](https://www.standardwebhooks.com/) spec
  (`webhook-id`, `webhook-timestamp`, `webhook-signature` headers). Store it as
  `GITLAB_WEBHOOK_SIGNING_TOKEN`.
- **Secret token (legacy).** GitLab sends the token back as plain text in
  `X-Gitlab-Token`. GitLab's docs say it is "not recommended for new webhooks". Store it
  as `GITLAB_WEBHOOK_TOKEN`.

## Get Your Signing Token

In the webhook form, select **Generate signing token** and copy the value. GitLab shows it
only once, and it is never returned by the API. It has the form `whsec_<base64>`.

When creating the webhook through the API instead, pass your own `signing_token`, which
must be `whsec_` followed by the base64 of a 32-byte key:

```bash
echo "whsec_$(openssl rand -base64 32)"
```

## Get Your Secret Token (legacy)

If you still need the secret token, GitLab lets you create your own:

1. Generate a secure random token:
   ```bash
   # Using OpenSSL
   openssl rand -hex 32

   # Using Node.js
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

   # Using Python
   python -c "import secrets; print(secrets.token_hex(32))"
   ```

2. Save this token - you'll use it in both GitLab and your application

## Register Your Webhook

### Via GitLab Web UI

1. Navigate to your project in GitLab
2. Go to **Settings** → **Webhooks** (in the left sidebar)
3. Fill in the webhook form:
   - **URL**: Your webhook endpoint (e.g., `https://api.example.com/webhooks/gitlab`)
   - **Signing token** (recommended): Select **Generate signing token** and copy it
   - **Secret token** (legacy, optional): Paste the token you generated
   - **Trigger**: Select events you want to receive:
     - ✓ Push events
     - ✓ Tag push events
     - ✓ Comments
     - ✓ Issues events
     - ✓ Merge request events
     - ✓ Wiki page events
     - ✓ Pipeline events
     - ✓ Job events
     - ✓ Deployment events
     - ✓ Release events
   - **Enable SSL verification**: Keep enabled for security
4. Click **Add webhook**

### Via GitLab API

```bash
curl -X POST "https://gitlab.com/api/v4/projects/{project_id}/hooks" \
  -H "PRIVATE-TOKEN: your_gitlab_token" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://api.example.com/webhooks/gitlab",
    "signing_token": "whsec_<base64 of a 32-byte key>",
    "push_events": true,
    "issues_events": true,
    "merge_requests_events": true,
    "wiki_page_events": true,
    "pipeline_events": true,
    "job_events": true,
    "deployment_events": true,
    "releases_events": true,
    "enable_ssl_verification": true
  }'
```

## Test Your Webhook

GitLab provides a test button for each webhook:

1. In **Settings** → **Webhooks**, find your webhook
2. Click **Test** and select an event type
3. GitLab will send a sample payload to your endpoint
4. Check the **Recent events** tab to see the delivery status

## Custom Headers

You can add custom headers to webhook requests:

1. In the webhook settings, scroll to **Custom headers**
2. Add headers in the format: `Header-Name: value`
3. Common use cases:
   - `X-Environment: production`
   - `X-Service-Key: internal-key`

## Webhook Templates

GitLab supports custom webhook templates to transform payloads:

1. Enable **Custom webhook template** in webhook settings
2. Write a Liquid template to transform the payload
3. Example:
   ```liquid
   {
     "project": "{{ project.name }}",
     "event": "{{ object_kind }}",
     "user": "{{ user_username }}",
     "timestamp": "{{ build_started_at }}"
   }
   ```

## Troubleshooting

### Webhook Auto-disabled

If your webhook fails repeatedly, GitLab will disable it:

1. Check **Recent events** for error details
2. Fix the issue (timeout, SSL, response code)
3. Click **Enable** to reactivate the webhook

### Common Issues

- **401 Unauthorized**: Signature or token mismatch. Check that `GITLAB_WEBHOOK_SIGNING_TOKEN`
  is the full `whsec_...` value, that you verify the raw body (not re-serialized JSON), and
  that your server clock is correct (`webhook-timestamp` must be within 5 minutes). For the
  legacy path, check that `GITLAB_WEBHOOK_TOKEN` matches the secret token.
- **Timeout**: Endpoint must respond within 10 seconds
- **SSL errors**: Ensure valid SSL certificate or disable verification (not recommended)
- **4xx/5xx responses**: GitLab expects 2xx status codes