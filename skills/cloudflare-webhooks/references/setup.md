# Setting Up Cloudflare Webhooks

Docs: [Configure webhooks](https://developers.cloudflare.com/notifications/get-started/configure-webhooks/)

## Prerequisites

- A Cloudflare account. Webhooks are available on all plans, and accounts
  without a paid zone can configure up to 100 webhook destinations.
- A publicly reachable HTTPS endpoint that accepts POST requests. Generic
  webhooks are delivered only to a publicly resolvable IP on **port 80 or 443**.
  For a private IP or other port, forward via a Worker or use a Cloudflare
  Tunnel. For local development, see [Local development](#local-development).

## Choose Your Secret

Cloudflare doesn't generate the secret. You pick it and enter it in the
dashboard, and your endpoint compares against the same value.

```bash
openssl rand -hex 32
```

Store it as `CLOUDFLARE_WEBHOOK_SECRET`. Cloudflare recommends always using a
secret for generic webhooks.

## Create the Webhook Destination

1. In the Cloudflare dashboard, go to **Alerts** → **Destinations**.
2. In the **Webhooks** card, select **Create**.
3. Give the webhook a name.
4. In **URL**, enter your endpoint, e.g.
   `https://your-app.example.com/webhooks/cloudflare`.
5. In **Secret**, enter the value you generated. Cloudflare sends it in the
   `cf-webhook-auth` header.
6. Select **Save and Test**. Cloudflare posts a test message containing only
   `text`. Your endpoint should answer 2xx.

You can later rename or delete a webhook from the same card. The edit form
only changes the name.

## Attach It to a Notification Policy

A destination alone sends nothing. Create or edit a notification policy
(**Alerts** → **Create**, or a product's own alert settings), choose the alert
type, and add the webhook as a destination. Each policy's alerts arrive with
that policy's `policy_id` and `alert_type`.

## Allow Cloudflare's IP Ranges

Webhook alerts are sent from [Cloudflare's IP ranges](https://www.cloudflare.com/ips/).
If a firewall protects your endpoint, allowlist them. The ranges are shared
across services and change over time, so fetch them from the
[Cloudflare IPs API](https://developers.cloudflare.com/api/resources/cloudflare_ips/methods/list/)
rather than hard-coding.

An endpoint behind Cloudflare itself (a proxied hostname with WAF or bot rules)
can block these requests. Test with **Save and Test**.

## Local Development

```bash
npx hookdeck-cli listen 3000 cloudflare --path /webhooks/cloudflare
```

Use port `8000` for FastAPI. Paste the printed HTTPS URL into the webhook's
**URL** field, enter your secret, then **Save and Test**.

## Testing

1. **Save and Test** sends the `text`-only test message.
2. To see real payloads, trigger a policy, or replay one from the Hookdeck
   CLI web UI.
3. The notification **History** page shows what Cloudflare sent.
