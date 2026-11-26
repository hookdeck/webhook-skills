# Setting Up Asana Webhooks

Asana webhooks are created **via the API**, not a dashboard. You POST a webhook
definition, Asana performs a handshake against your endpoint, and your endpoint must
capture the secret it receives.

## Prerequisites

- An Asana account with access to the resource you want to watch.
- A **Personal Access Token (PAT)** or OAuth bearer token. Create a PAT under
  [Asana → My Settings → Apps → Developer apps → Personal access tokens](https://app.asana.com/0/my-apps).
- A publicly reachable HTTPS `target` URL for your handler (use the Hookdeck CLI or a
  tunnel during development).
- The `gid` of the resource to watch (a project, task, workspace, etc.). You can find
  a project's `gid` in its URL or via `GET /projects`.

## How Authentication Works

Webhooks are tied to the **token used to create them**. There is no separate webhook
API key — you authenticate the *create* request with your PAT/OAuth token:

```
Authorization: Bearer <ASANA_ACCESS_TOKEN>
```

If that token is later deactivated or the user is removed, Asana deletes the webhook.
The token is also what you use for follow-up API calls to fetch full resource details.

## Step 1: Start Your Handler and Tunnel

Your endpoint must be reachable **before** you create the webhook, because Asana
performs the handshake synchronously during the create request.

```bash
# In your example directory
npm start        # or: uvicorn main:app --port 8000

# In another terminal
npx hookdeck-cli listen 3000 asana --path /webhooks/asana
```

Copy the public URL Hookdeck prints (e.g. `https://<id>.hookdeck.dev/webhooks/asana`).

## Step 2: Create the Webhook (triggers the handshake)

```bash
curl -X POST https://app.asana.com/api/1.0/webhooks \
  -H "Authorization: Bearer $ASANA_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "resource": "<PROJECT_GID>",
      "target": "https://<your-tunnel>/webhooks/asana"
    }
  }'
```

During this request:

1. Asana POSTs to your `target` with an `X-Hook-Secret` header and no signature.
2. Your handler **echoes the same `X-Hook-Secret` back as a response header** and
   returns `200` (or `204`). **Store that secret** — it is the HMAC key for all future events.
3. Asana returns `201 Created` with the webhook object (including its `gid`) and the
   same `X-Hook-Secret` in the response body. Asana recommends checking it matches the
   one your handler received. Through a Hookdeck URL, Hookdeck answers the handshake, so
   take the secret from this response body instead.

If the handshake fails, Asana returns an error and does **not** create the webhook.

## Filters (required for high-level resources)

For most resources filters are optional. For **workspace**, **team**,
**portfolio**, and **goal** resources, filters are **required**. Pass them in the
create request:

```json
{
  "data": {
    "resource": "<WORKSPACE_GID>",
    "target": "https://<your-tunnel>/webhooks/asana",
    "filters": [
      { "resource_type": "task", "action": "changed", "fields": ["completed", "name"] },
      { "resource_type": "task", "action": "added" }
    ]
  }
}
```

Filters also reduce noise on any webhook by limiting which `resource_type`/`action`/
`fields` combinations are delivered, and they populate the `change` object on events.

## Storing the Secret

The example handlers read the secret from the `ASANA_WEBHOOK_SECRET` environment
variable for simplicity. In production you will run **many** webhooks, each with its
**own** secret, so:

- Persist the `X-Hook-Secret` from each handshake keyed by the webhook `gid`.
- Look up the right secret per delivery (the webhook `gid` is available from the
  webhook object you stored at creation; correlate by target/resource as needed).

## Managing Webhooks

```bash
# List your webhooks in a workspace
curl "https://app.asana.com/api/1.0/webhooks?workspace=<WORKSPACE_GID>" \
  -H "Authorization: Bearer $ASANA_ACCESS_TOKEN"

# Delete a webhook
curl -X DELETE "https://app.asana.com/api/1.0/webhooks/<WEBHOOK_GID>" \
  -H "Authorization: Bearer $ASANA_ACCESS_TOKEN"
```

Your handler can also respond `410 Gone` to any delivery to make Asana delete the
webhook.

## Reference

- [Asana Webhooks Guide](https://developers.asana.com/docs/webhooks-guide)
- [Establish a webhook (API reference)](https://developers.asana.com/reference/createwebhook)
