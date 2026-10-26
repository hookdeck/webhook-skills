# Nextcloud Webhooks - Next.js Example

Minimal example of receiving Nextcloud `webhook_listeners` webhooks and authenticating them with
a secret header.

Nextcloud does not sign payloads, so there is no HMAC to verify. The handler compares the header
named by `NEXTCLOUD_WEBHOOK_HEADER` (default `Authorization`) with `NEXTCLOUD_WEBHOOK_SECRET`, the
exact whole header value, using a constant-time comparison. The route reads the body with `request.text()`, so any content type works. The route accepts
`POST`, `PUT`, `PATCH`, `GET` and `DELETE` (`httpMethod` is chosen when the webhook is
registered) and acknowledges an empty body.

> A static shared credential authenticates the sender, not the body, and gives no replay
> protection (no signature, no timestamp). Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Node.js 20+
- A Nextcloud server with the `webhook_listeners` app (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `NEXTCLOUD_WEBHOOK_HEADER` and `NEXTCLOUD_WEBHOOK_SECRET` to the header name and the exact
   header value you registered in `authData` (e.g. `Bearer your-shared-secret`).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `/webhooks/nextcloud`.

## Test

```bash
npm test
```

The tests send every handled event with each HTTP method and with correct, wrong, truncated and
missing credentials. No Nextcloud server is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/nextcloud \
  -H "Content-Type: application/json" \
  -H "Authorization: $NEXTCLOUD_WEBHOOK_SECRET" \
  -d '{"event":{"class":"OCP\\Files\\Events\\Node\\NodeCreatedEvent","node":{"id":1,"path":"/admin/files/a.txt"}},"user":{"uid":"admin","displayName":"Admin"},"time":1700100000}'
```

## Receive Webhooks Locally

Nextcloud must be able to reach your machine. Tunnel with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 nextcloud --path /webhooks/nextcloud
```

Register the printed URL as the webhook `uri`. If you receive through Hookdeck and your listener
uses a method other than `POST`, also allow that method on the Hookdeck Nextcloud source.

## How It Works

1. The credential header is checked before the body is parsed. Failure returns `401`.
2. An empty body is acknowledged with `200`; otherwise the body must be a JSON object (`400`).
3. The handler dispatches on `event.class`: `OCP\Files\Events\Node\NodeCreatedEvent`,
   `NodeWrittenEvent`, `NodeTouchedEvent`, `NodeDeletedEvent`, `NodeCopiedEvent`,
   `NodeRenamedEvent`, `NodeRestoredEvent`, `OCP\SystemTag\TagAssignedEvent`, `TagUnassignedEvent`,
   `OCP\Calendar\Events\CalendarObjectCreatedEvent`, `CalendarObjectUpdatedEvent`,
   `CalendarObjectDeletedEvent` and `OCA\Forms\Events\FormSubmittedEvent`.
4. It returns `200 {"received": true}`.
