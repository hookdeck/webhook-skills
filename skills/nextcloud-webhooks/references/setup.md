# Setting Up Nextcloud Webhooks

## Prerequisites

- A Nextcloud server with the `webhook_listeners` app enabled: `occ app:enable webhook_listeners`
- An account with administrator rights, or delegated "Webhooks" administration rights, to call the OCS API
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 nextcloud --path /webhooks/nextcloud` locally)

## Choose a Secret Header

Nextcloud has no signing secret. Instead, pick a header name and a secret value and register them
as `authData`. Nextcloud merges that into the headers of every call. Store both on your side:

```bash
NEXTCLOUD_WEBHOOK_HEADER=Authorization
NEXTCLOUD_WEBHOOK_SECRET="Bearer a-long-random-value"
```

`NEXTCLOUD_WEBHOOK_SECRET` must be the exact header value Nextcloud will send, including any
`Bearer ` prefix you type. The handler compares the whole value.

## Register Your Endpoint

Call the OCS API as an admin (the `OCS-APIRequest: true` header is required):

```bash
curl -u admin:APP_PASSWORD -X POST \
  "https://cloud.example.com/ocs/v2.php/apps/webhook_listeners/api/v1/webhooks" \
  -H "OCS-APIRequest: true" -H "Accept: application/json" -H "Content-Type: application/json" \
  -d '{
    "httpMethod": "POST",
    "uri": "https://example.com/webhooks/nextcloud",
    "event": "OCP\\Files\\Events\\Node\\NodeCreatedEvent",
    "authMethod": "header",
    "authData": { "Authorization": "Bearer a-long-random-value" }
  }'
```

| Parameter | Notes |
|-----------|-------|
| `httpMethod` | Free string (POST, PUT, PATCH, GET, DELETE...). Required |
| `uri` | Your endpoint. Required |
| `event` | One event class per listener; register one listener per event. Required |
| `authMethod` | `header` or `none`. Use `header` |
| `authData` | `{header: value}` merged into the request headers |
| `eventFilter` | Optional Mongo-style filter on the payload (`{"user.uid": "bob"}`, `event.node.path` regexes) |
| `userIdFilter` | Optional: only fire for events by this user |
| `headers` | Optional extra static headers |

Other calls: `GET .../webhooks` lists listeners, `POST .../webhooks/{id}` updates one,
`DELETE .../webhooks/{id}` removes it. `occ webhook_listeners:list` prints them from the shell.

## Use It With Hookdeck

Create a Hookdeck source of type **Nextcloud** and register the Hookdeck source URL as `uri`.
Configure the source with the same header name and value. The source pre-selects `POST` without
managing the method, so if your listener uses `PUT`, `PATCH`, `GET` or `DELETE`, also allow that
method on the source.

## Test

Create or upload a file in Nextcloud (for `NodeCreatedEvent`), then wait for the background job
(up to 5 minutes by default). Or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/nextcloud \
  -H "Content-Type: application/json" \
  -H "Authorization: $NEXTCLOUD_WEBHOOK_SECRET" \
  -d '{"event":{"class":"OCP\\Files\\Events\\Node\\NodeCreatedEvent","node":{"id":1,"path":"/admin/files/a.txt"}},"user":{"uid":"admin","displayName":"Admin"},"time":1700100000}'
```

## Network Notes

Self-hosted servers have their own egress IPs, so allowlisting depends on your deployment. The
secret header remains the portable check. Nextcloud must be able to make outgoing requests to your
host; if the endpoint is on a private network, check your server's outgoing-request restrictions.
