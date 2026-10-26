# Setting Up Semaphore CI Webhooks

## Prerequisites

- A Semaphore organization where you can create secrets and notifications
- Your application's webhook endpoint URL (HTTPS)

## Get Your Webhook Secret

> Set a webhook secret on the Semaphore notification and paste its WEBHOOK_SECRET value. Without one, deliveries are unsigned and fail verification.

Signing is opt-in. Create an **organization secret** that contains an environment variable named
`WEBHOOK_SECRET` with a secret value of your choice, for example:

```bash
sem create secret semaphore-webhook-secret -e WEBHOOK_SECRET=a-long-random-value
```

The value of `WEBHOOK_SECRET` is the signing key. Put it in `SEMAPHORE_WEBHOOK_SECRET` in your
application and, if you use Hookdeck, in the source's webhook secret.

## Register Your Endpoint

Create a notification that names the secret, or fill in the same fields in the notification form in
the UI:

```bash
sem create notification pipeline-results \
  --projects "my-project" \
  --branches "main" \
  --webhook-endpoint "https://your-domain.com/webhooks/semaphore" \
  --webhook-secret "semaphore-webhook-secret"
```

The rule filters are projects, branches, tags, pipelines and results (`passed`, `failed`, `stopped` or
`canceled`). The CLI takes `--projects`, `--branches`, `--tags` and `--pipelines`; set `results` by
editing the notification YAML (`sem edit notification <name>`). Regular expressions are wrapped in
slashes, for example `/.*/`.

To change the response timeout or retries, edit the notification YAML. The defaults are a 500 ms
timeout and no retries:

```yaml
notify:
  webhook:
    endpoint: https://your-domain.com/webhooks/semaphore
    timeout: 1000   # ms, default 500
    retries: 3      # on timeouts only, default 0, max 5
    secret: semaphore-webhook-secret
```

## Hookdeck Source

If Hookdeck sits in front of your endpoint, create a source of type **Semaphore CI** and use its URL
as the webhook endpoint.

- Paste the `WEBHOOK_SECRET` value as the source's webhook secret. Without a secret on the
  notification, deliveries are unsigned and fail verification.
- **Methods:** Semaphore's docs don't name the HTTP method. Hookdeck's Semaphore CI source pre-selects
  POST without managing the method, so any other method Semaphore uses must also be allowed on the
  source.
- Semaphore's default response timeout is 500 ms and it retries only on timeouts, so respond
  quickly and process the delivery afterwards.

## Test Mode vs Live Mode

Semaphore has no separate test mode. Narrow the notification rule to a test project or branch, push a
commit, and wait for the pipeline to finish: the webhook is sent when the pipeline is done.

## Local Development

```bash
npx hookdeck-cli listen 3000 semaphore --path /webhooks/semaphore
```
