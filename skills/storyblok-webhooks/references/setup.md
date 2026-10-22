# Setting Up Storyblok Webhooks

## Prerequisites

- A Storyblok space where you can open **Settings**
- A **paid plan** if you want signed webhooks (Webhook secrets are not available on free plans)
- Your application's public HTTPS endpoint URL (use `npx hookdeck-cli listen 3000 storyblok --path /webhooks/storyblok` for local development)

## Get Your Signing Secret

Storyblok does not generate the secret. You choose it. Any string works and is used verbatim as the HMAC key. Generate a random one:

```bash
openssl rand -hex 20
# Example output: a4eabf7836aab21c6239e3db67b4681c17a8eb87
```

Store it as `STORYBLOK_WEBHOOK_SECRET` in your application.

## Register Your Endpoint

1. In your space, open **Settings → Webhooks** and select **+ New Webhook**.
2. Enter a name and optional description.
3. Enter the **Endpoint URL**, for example `https://example.com/webhooks/storyblok`.
4. On a paid plan, enter the **Webhook secret** from the previous step.
5. Select one or more triggers (events). Recommended to start: Story `published`, `unpublished`, `deleted`, `moved`.
6. Save.

Your endpoint must respond with `2xx` and `content-type: application/json`.

## Optional Apps and Labs

| Trigger group | Requirement |
|---------------|-------------|
| Experiments | Paid plan; enable **Experiments** in **Settings → Labs** |
| Releases | Paid plan; install the Releases app |
| Pipelines | Paid plan; install the Pipelines app |
| Task triggers | Install the Tasks app; unsigned (see below) |

## Task (Tasks App) Webhooks Are Unsigned

Webhooks fired by the Tasks app do not support secrets and carry no `webhook-signature`. Their requests are logged under **Settings → Webhook Logs** as "Task Triggered Hook". To authenticate them, add a secret in the task's **User dialog** field; it arrives in `dialog_values` and you check it in your application. Handle tasks on a separate route from the signed webhook.

## Restrict by IP (Alternative or Extra Layer)

Storyblok sends from static IPs. Allow **both** primary and fallback for your space's region:

| Region | Primary IP | Fallback IP |
|--------|-----------|-------------|
| European Union (EU) | 3.121.25.244 | 35.159.255.4 |
| United States (US) | 44.206.118.25 | 3.231.44.46 |
| Canada (CA) | 15.157.6.14 | 35.183.66.204 |
| Australia (AP) | 13.238.72.230 | 52.63.91.95 |
| China | N/A | N/A |

This is the only option on plans without webhook secrets. Behind a proxy or Hookdeck, the source IP is the proxy's, so rely on the signature instead.

## Test Your Webhook

- Trigger a real action (publish a test story) and open **Settings → Webhooks → View logs** to see status, response, and payload.
- Use webhook.site or the Hookdeck CLI to inspect requests.
- Webhooks are not retried, so fix the endpoint and trigger the action again.
