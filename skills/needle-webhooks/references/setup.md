# Setting Up Needle Webhooks

## Prerequisites

- A Needle workspace (webhooks pause while the plan is inactive, for example after the free trial)
- A public **HTTPS** endpoint that accepts `POST` requests (the URL must start with `https://`)

## How Do I Get the Signing Secret?

When you add a webhook, Needle returns its signing secret, which starts with `whsec_`. **It is shown only once.** Store it where your receiver can read it, as `NEEDLE_WEBHOOK_SECRET`. The secret stays the same when you later change the URL, headers or event types.

## How Do I Register an Endpoint?

Add a webhook in any of three ways:

1. **Dashboard:** Settings > Integrations
2. **API:** *Create a webhook* (see the [webhooks docs](https://needle.app/docs/webhooks))
3. **MCP:** the `needleCreateWebhook` tool

Rules:

- Any workspace member can add webhooks; only the member who added one can change it. They or a workspace admin can delete it.
- A workspace can have up to 5 webhooks.
- A webhook only receives events its creator can see, and is deleted when that member leaves the workspace.

## How Do I Choose Event Types?

In Settings, start from a preset and tick or untick single types:

- **All events:** every type. With "Also send event types Needle adds later" on, new types are sent as soon as they exist.
- **Recommended:** every LinkedIn and Instagram event, plus leads added, suppressed leads, finished sequences, AI messages written, and messages held for approval and approved.
- **Engagements:** replies only.

In the API and MCP, `eventTypes` is `"all"` (also types added later, and the default if left out) or a list of types. A list never grows on its own.

## Custom Headers

If your endpoint needs its own key, such as `Authorization: Bearer <your key>`, add it as a header in Settings > Integrations or with `headers` in Create/Update a webhook. Needle sends it with every request.

- Up to 5 headers; names are stored in lower case.
- To change one, send only its new value. To remove one, send `null`.
- Needle's own headers can't be replaced: `content-type`, `content-encoding`, `user-agent`, the `webhook-` headers, and connection headers such as `host`.
- Headers are **not part of the signature**, so signature verification works the same way. Keep verifying the signature.

## Testing Locally

```bash
npx hookdeck-cli listen 3000 needle --path /webhooks/needle   # FastAPI: 8000
```

Use the printed `https://` URL as the webhook URL, then trigger an event (for example create a lead) in Needle.
