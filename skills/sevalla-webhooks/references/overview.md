# Sevalla Webhooks Overview

## What Are Sevalla Webhooks?

A Sevalla webhook sends an HTTP `POST` with a JSON body (`content-type: application/json`) to your
endpoint each time one of the events you picked happens in your company, such as a deployment
finishing. Use them to post deploy notifications to chat, start tests after a deployment, or keep
another system in sync without polling the API.

Requests are **not signed**. The `svl-signature` header carries the webhook's signing secret
itself (`whsec_` followed by 30 characters), not a hash of the body. See
[verification.md](verification.md).

A company can have up to 10 webhooks. Each webhook covers every application and static site in the
company; you can't limit it to one service, so filter on the IDs in the payload.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `APP_CREATE` | An application is created | Register the app elsewhere |
| `APP_DEPLOY` | A deployment starts (`inProgress`), and again when it ends (`success`, `failed`, `cancelled`) | Chat notifications, run tests after a deploy |
| `APP_UPDATE` | Name, default branch, automatic deployments, hibernation or project changed in the dashboard (not via the API) | Keep an inventory in sync |
| `APP_DELETE` | An application is deleted | Clean up |
| `STATIC_SITE_CREATE` | A static site is created | Register the site |
| `STATIC_SITE_DEPLOY` | A static site deployment starts, and again when it ends | Purge caches, notify |
| `STATIC_SITE_UPDATE` | A static site's settings are updated | Keep an inventory in sync |
| `STATIC_SITE_DELETE` | A static site is deleted | Clean up |
| `DATABASE_CREATE`, `DATABASE_UPDATE`, `DATABASE_DELETE` | Selectable, but not sent at the moment | - |

Deployments of preview apps and pull request previews also send deploy events, with `is_preview`
set to `true`.

## Event Payload Structure

Every body has the same envelope; `data` depends on `type`.

```json
{
  "webhook_id": "d5f8a1c2-3b4e-4f6a-8b8c-9d0e1f2a3b4c",
  "event_id": "a1b2c3d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d",
  "event_delivery_id": "f1e2d3c4-b5a6-4788-9a0b-c1d2e3f4a5b6",
  "type": "APP_DEPLOY",
  "data": {
    "company_id": "0c9e3f5a-7b2d-4e1f-8a6c-5d4b3a2f1e0d",
    "app_id": "7f3c2b1a-9e8d-4c7b-a6f5-4e3d2c1b0a9f",
    "app_name": "storefront-x7k2m",
    "app_display_name": "storefront",
    "deployment_id": "3b2a1c0d-8e7f-4a6b-9c5d-2e1f0a9b8c7d",
    "status": "success",
    "commit": "9fceb02d0ae598e95dc970b74767f19372d61af8",
    "stage": "",
    "is_preview": false
  }
}
```

- `webhook_id` - the webhook that sent the request
- `event_id` - the same on every retry: use it to drop duplicates
- `event_delivery_id` - new on every delivery attempt
- `type` - the event
- `data` - event details. `APP_CREATE`/`APP_UPDATE`/`APP_DELETE` carry `id`, `company_id`, `name`,
  `display_name` (plus `location` on create); `STATIC_SITE_DEPLOY` carries `static_site_id`,
  `static_site_name`, `static_site_display_name`, `deployment_id`, `status`, `repo_url`, `branch`,
  `commit`, `is_preview`.

## Delivery

Any `2xx` is success. Anything else, or no response, is a failed delivery and is retried up to 10
times (after 1 min, 5 min, 10 min, 30 min, 1 h, 2 h, 4 h, 8 h, 16 h, 1 day: about 2 days and 8
hours). Order is not guaranteed. Respond with a `2xx` as soon as you've checked the header, then do
slow work.

## Full Event Reference

See [Sevalla's webhook documentation](https://docs.sevalla.com/developer-tools/webhooks).
