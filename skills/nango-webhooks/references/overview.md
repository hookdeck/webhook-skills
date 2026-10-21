# Nango Webhooks Overview

## What Are Nango Webhooks?

[Nango](https://nango.dev) is an integrations platform: it handles OAuth and other auth for 500+ APIs, runs sync and action functions, and can forward webhooks from external APIs. Nango POSTs webhooks to your app to tell it that:

- a connection was created, re-authorized, failed to refresh (or recovered), or was deleted (`auth`)
- a sync function run finished, successfully or not (`sync`)
- an external API sent a webhook that Nango forwarded to you (`forward`)
- an async action finished (`async_action`)

Webhook settings are per **environment** (e.g. `dev`, `prod`). Each environment can have up to two webhook URLs; every webhook goes to both. A connection can override both with its own `webhook_url_override`.

## What Webhook Types Does Nango Send?

Nango doesn't use event names. Every webhook body has a `type`; route on it, then on `operation` and/or `success`.

| `type` | Sub-field | Triggered When | Common Use Cases |
|--------|-----------|----------------|------------------|
| `auth` | `operation: "creation"` | A new connection was created (`success: true`) or creation failed (`success: false`) | **Required:** store `connectionId` against your user/org (via `tags`) |
| `auth` | `operation: "override"` | An existing connection was re-authorized | Clear "reconnect needed" flags |
| `auth` | `operation: "refresh"` | `success: false`: an OAuth token refresh failed. `success: true`: a refresh succeeded after a previous failure | Prompt the user to reconnect, or clear the warning |
| `auth` | `operation: "deletion"` | A connection was deleted from the dashboard or API | Remove the stored connection and its data |
| `sync` | `success: true` | A sync run finished | Fetch changed records with the records API (cursor-based) |
| `sync` | `success: false` | A sync run failed | Alert, surface `error` |
| `forward` | — | Nango forwarded an external API webhook | Handle the provider's raw event in `payload` |
| `async_action` | — | An async action finished | Read the action result in `payload` |

New types are added without notice. Return `200` and ignore types you don't handle.

Exact type definitions: [`packages/types/lib/webhooks/api.ts`](https://github.com/NangoHQ/nango/blob/master/packages/types/lib/webhooks/api.ts).

## What Does an Auth Webhook Look Like?

```json
{
  "type": "auth",
  "operation": "creation",
  "connectionId": "<your-connection-id>",
  "authMode": "OAUTH2",
  "providerConfigKey": "<your-integration-id>",
  "provider": "hubspot",
  "environment": "DEV",
  "success": true,
  "tags": {
    "end_user_id": "<your-end-user-id>",
    "end_user_email": "<your-end-user-email>",
    "organization_id": "<your-organization-id>"
  }
}
```

Failures (`success: false`) add `"error": { "type": "...", "description": "..." }`. Webhooks are only sent for some connection-creation errors: errors shown inside the provider's OAuth window never reach Nango. Deletion webhooks are not sent for bulk deletions (deleting an integration or environment).

## What Does a Sync Webhook Look Like?

Success:

```json
{
  "type": "sync",
  "connectionId": "<your-connection-id>",
  "providerConfigKey": "<your-integration-id>",
  "syncName": "<your-sync-script-name>",
  "model": "<your-model-name>",
  "syncType": "INCREMENTAL",
  "success": true,
  "modifiedAfter": "2026-10-21T09:00:00.000Z",
  "responseResults": { "added": 3, "updated": 1, "deleted": 0 },
  "checkpoints": { "from": { "cursor": "abc" }, "to": { "cursor": "def" } }
}
```

Failure replaces `modifiedAfter`/`responseResults` with `error`, `startedAt` and `failedAt`.

- `modifiedAfter` marks the start of the run. Fetch changed records promptly: Nango prunes record payloads not updated for 30 days.
- `syncType` is deprecated. Use `checkpoints`: if `checkpoints` is missing/`null` or `checkpoints.from === null`, treat the run as a full sync; otherwise it is incremental. Always guard against `checkpoints` being absent.
- By default Nango also sends "empty" sync webhooks (`added`, `updated`, `deleted` all `0`); this can be turned off in Environment Settings.

## What Does a Forwarded Webhook Look Like?

When Nango can attribute an external webhook to a connection, it wraps it:

```json
{
  "from": "hubspot",
  "providerConfigKey": "<INTEGRATION-ID>",
  "type": "forward",
  "connectionId": "<CONNECTION-ID>",
  "payload": { "...": "raw provider payload" }
}
```

- One forward is sent per matching connection.
- If Nango can't attribute the webhook, it forwards the **raw provider payload without the wrapper** (no `type: "forward"`). Your handler should accept that shape too.
- If Nango skipped the provider's signature check (e.g. no webhook secret set on the integration), it adds `"unverified": true` to the wrapper and the `X-Nango-Webhook-Unverified: true` header. Nango's own signature is still valid; treat the payload as untrusted.

## Delivery and Retries

- All webhooks are `POST` with a JSON body.
- Non-2xx responses are retried 2 times with exponential backoff (100 ms starting delay, ×2).
- Requests time out after 20 seconds. Acknowledge quickly and process asynchronously.
- Every attempt is visible in Nango's logs.

There is no unique delivery ID header, so build idempotency keys from the body (for example `type` + `connectionId` + `operation` for auth, or `syncName` + `connectionId` + `modifiedAfter` for sync).

## Full Reference

- [Receive webhooks from Nango](https://nango.dev/docs/guides/platform/webhooks-from-nango)
- [External webhook forwarding](https://nango.dev/docs/guides/platform/webhook-forwarding)
