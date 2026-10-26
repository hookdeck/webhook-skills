# Setting Up Memos Webhooks

## Prerequisites

- A Memos instance on 0.31 or later (older versions don't sign deliveries in the Standard Webhooks format)
- Your application's public HTTP(S) webhook URL (use the Hookdeck CLI for local development)

## How Do I Add a Webhook?

Webhooks are configured per user in the **Settings** page of your Memos instance. Add a webhook with your endpoint URL. The URL must use `http` or `https` and must resolve when you create or update the webhook. Every webhook receives every memo event: there is no per-event selection.

## Where Is My Signing Secret?

New webhooks get a signing secret in the form `whsec_<base64>` (32 random bytes). **Copy it when the webhook is created** and store it as a secret in the receiving service; you can also reveal it later from the webhook's edit dialog. Store the full value, prefix included, in `MEMOS_WEBHOOK_SECRET`.

Older webhooks are unsigned: open the webhook's edit dialog and generate a secret there. Until you do, Memos sends no `webhook-*` headers and a handler that verifies signatures will reject every delivery.

The secret is per webhook, so each webhook URL has its own `MEMOS_WEBHOOK_SECRET`.

## Why Does Memos Say the Delivery Failed?

Memos treats a response without JSON `{"code":0}` as a failed delivery. Hookdeck's configuration alert for this source reads:

> "Generate a signing secret in the Memos webhook edit dialog. Older webhooks are unsigned until you do. Memos treats any response without JSON {"code":0} as failed, so set a custom response with body {"code":0} on this source."

If you receive through Hookdeck, open the source's settings and add a custom response with body `{"code":0}` (and a JSON content type), because Hookdeck's default acknowledgement isn't what Memos expects. If you receive directly, the examples already return `{"code":0}` on success.

## Private-Network Destinations

By default Memos rejects webhook targets that resolve to loopback, RFC 1918, link-local or IPv6 local addresses, to protect the instance from server-side request forgery. In 0.31, allow only the private destinations you need with `--webhook-private-network-allowlist` or `MEMOS_WEBHOOK_PRIVATE_NETWORK_ALLOWLIST` (comma-separated exact hostnames, IP addresses or CIDRs; hostnames are not wildcards):

```bash
export MEMOS_WEBHOOK_PRIVATE_NETWORK_ALLOWLIST="hooks.internal.example,10.0.0.8,10.20.0.0/24"
```

A local tunnel URL from the Hookdeck CLI is public, so it needs no allowlist entry.

## How Do I Test a Webhook?

Create or edit a memo and watch for the delivery. For a local handler:

```bash
# Express / Next.js (use 8000 for FastAPI)
npx hookdeck-cli listen 3000 memos --path /webhooks/memos
```

Use the printed URL as the webhook URL, and make sure the handler answers `{"code":0}`.

## Secret Rotation and IP Allowlists

The docs don't describe rotating a secret beyond revealing or generating one in the edit dialog. Memos is self-hosted, so deliveries come from your own instance: allow its egress address if you filter inbound traffic, and always verify the signature rather than relying on the source IP.
