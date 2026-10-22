# Setting Up Strapi Webhooks

## Prerequisites

- A Strapi project with access to the admin panel (Settings > Webhooks), or the ability to edit `./config/server`
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 strapi --path /webhooks/strapi` locally)

## Choose Your Auth Header

Strapi doesn't sign requests, so pick a header name and a secret value yourself. The common
choice is `Authorization: Bearer <token>`. Store both in your receiver:

```bash
STRAPI_WEBHOOK_HEADER=Authorization
STRAPI_WEBHOOK_SECRET=Bearer my-very-secured-token   # exact, whole value, prefix included
```

Generate a long random token (for example `openssl rand -hex 32`).

## Register Your Endpoint

### Per webhook, in the admin panel

1. Go to **Settings > Webhooks** and select **Create new webhook**.
2. Enter a name and your URL (e.g. `https://example.com/webhooks/strapi`).
3. Under **Headers**, add your header: key `Authorization`, value `Bearer my-very-secured-token`.
4. Select the events to receive and save.

### For every webhook, in config

Set `defaultHeaders` in `./config/server.js` (or `.ts`). Headers set on a webhook itself override
these defaults.

```javascript
module.exports = ({ env }) => ({
  webhooks: {
    defaultHeaders: {
      Authorization: `Bearer ${env('WEBHOOK_TOKEN')}`,
    },
  },
});
```

If you build the value from an environment variable, `STRAPI_WEBHOOK_SECRET` in your receiver must
equal the final string, `Bearer ` prefix included.

## Test

Trigger a webhook from the admin panel (the **Trigger** button on the webhook), or create and
publish an entry. Or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/strapi \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer my-very-secured-token" \
  -H "X-Strapi-Event: entry.publish" \
  -d '{"event":"entry.publish","createdAt":"2026-09-09T08:49:28.619Z","model":"address","uid":"api::address.address","entry":{"id":2,"documentId":"w7vfs319acmaxnurjk5vaaza","city":"Paris 1er"}}'
```

## Notes

- Events marked Enterprise (`review-workflows.updateEntryStage`) or Growth/Enterprise
  (`releases.publish`) depend on your Strapi plan.
- `entry.publish` and `entry.unpublish` only fire for Content Types with Draft & Publish enabled.
