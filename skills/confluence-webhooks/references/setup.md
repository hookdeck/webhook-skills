# Setting Up Confluence Data Center Webhooks

## Prerequisites

- Confluence **Data Center** with Confluence Administrator or System Administrator global permissions (Confluence Cloud is not supported by this flow)
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Create the Webhook and Secret

1. Go to **Administration** menu > **General Configuration** > **Webhooks**.
2. Enter a **title**.
3. Enter the **URL** of your endpoint, e.g. `https://example.com/webhooks/confluence`.
4. Enter a **secret**: a string you define, up to 255 characters. **Always set one**: without a secret requests are not signed and carry no `X-Hub-Signature`.
5. Select **Test connection** to confirm Confluence can reach the endpoint.
6. Choose the events that should trigger the webhook (e.g. `page_created`, `page_updated`, `page_removed`, `comment_created`).
7. Select **Active** to enable it immediately, then **Create**.

Store the same secret in your receiver as `CONFLUENCE_WEBHOOK_SECRET`. Webhooks can also be created through the REST API (see the Confluence Data Center developer docs).

## Local Development

```bash
npx hookdeck-cli listen 3000 confluence --path /webhooks/confluence
```

Use the Hookdeck URL it prints as the webhook URL. The server must be reachable from Confluence, which for Data Center is often behind a firewall.

## Testing

"Test connection" checks reachability. To exercise verification, trigger a real event (publish or edit a page) and inspect the delivery.
