# Setting Up Lokalise Webhooks

## Prerequisites

- A Lokalise project where you can install apps
- A public HTTPS URL for your endpoint. During development, tunnel to localhost:

```bash
npx hookdeck-cli listen 3000 lokalise --path /webhooks/lokalise
```

(Use port `8000` for the FastAPI example.)

## 1. Install the Webhooks App

1. Open your project and go to **Apps**.
2. Find **Webhooks**, open it and press **Install**.

## 2. Enter the URL

Enter the endpoint that will receive events, e.g. `https://your-app.example.com/webhooks/lokalise`.
The endpoint must accept POST and return a `2xx` for the ping Lokalise sends when the
handler is created, so deploy (or tunnel) the handler first.

## 3. Choose How the Secret Is Sent

Lokalise generates a random alphanumeric secret when the app is enabled and sends it in an
`X-Secret` header. In the header section you can:

| Option | Header sent | Set `LOKALISE_WEBHOOK_HEADER` to |
|--------|-------------|----------------------------------|
| Secret (default) | `X-Secret: <secret>` | `X-Secret` |
| Send as API key | `X-Api-Key: <value you enter>` | `X-Api-Key` |
| Custom header | `<name>: <value>` (use an `X-` prefix) | your header name |

You can type your own value instead of the generated one. Use the refresh icon next to the
webhook (Apps > Webhooks) to regenerate the secret; update `LOKALISE_WEBHOOK_SECRET` at the
same time.

```bash
LOKALISE_WEBHOOK_SECRET=<the secret or header value>
LOKALISE_WEBHOOK_HEADER=X-Secret
```

## 4. Select Events

Pick the events to subscribe to. A good starting set: translation updated, key added /
modified / removed, task closed, file uploaded. Press **Enable app** (or **Save changes**
when adding handlers to an existing app).

Webhooks can also be created and removed through the Lokalise API (Webhooks endpoints).

## Testing

There is no test-event button in this guide; the ping on creation is the first delivery.
Change a translation in the project to fire `project.translation.updated`, or replay a
request with curl:

```bash
curl -X POST http://localhost:3000/webhooks/lokalise \
  -H "Content-Type: application/json" -H "X-Secret: $LOKALISE_WEBHOOK_SECRET" \
  -d '{"event":"project.keys.added","keys":[{"id":1,"name":"test.title"}]}'
```
