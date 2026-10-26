# Pinata Webhooks Overview

## What Are Pinata Webhooks?

[Pinata](https://pinata.cloud) is IPFS file storage and pinning. Through the Pinata App you can
create webhooks for events fired by the Pinata API for your account, such as uploading or
deleting a file. Deliveries go through [Svix](https://www.svix.com/): the endpoint dashboard,
logs, rate limiting and the event catalog are Svix features, and the signature scheme is Standard
Webhooks.

| Aspect | Value |
|--------|-------|
| Method | `POST` (Svix's delivery method; Pinata states none), JSON body |
| Signature headers | `webhook-id`, `webhook-timestamp`, `webhook-signature` (Svix's `svix-*` names carry the same values) |
| Secret | `whsec_...`, one per endpoint, on the webhook dashboard's right sidebar |
| Delivery | Timeout, retry schedule and ordering are not stated by Pinata |

## Event Payload Structure

Most events share one envelope with four top-level keys: `event_type`, `timestamp` (ISO 8601),
`workspace_id`, and `data`. The file or pin request is under `data.object`. There is no event id in the
body; the `webhook-id` header identifies the message.

```json
{
  "event_type": "ipfs.public.file_added",
  "timestamp": "2025-01-08T16:01:57.025041Z",
  "workspace_id": "11111111-1111-1111-1111-111111111111",
  "data": {
    "object": {
      "id": "11111111-1111-1111-1111-111111111111",
      "cid": "bafybeifhh5a2o4ilxviboof4c75kkv62hkljpdq3fo3uowkhdrgjr67kbm",
      "name": "001.png",
      "mime_type": "image/png",
      "size": 42,
      "number_of_files": 42,
      "group_id": "11111111-1111-1111-1111-111111111111",
      "keyvalues": { "examplekey": "example value" },
      "created_at": "2025-01-07T20:13:39.536Z"
    },
    "source": "direct_upload"
  }
}
```

Variations in Pinata's event catalog:

- `*.file_updated` adds `data.previous_attributes` with the values that changed.
- `ipfs.public.pin_by_cid_added` and `ipfs.public.pin_by_cid_failed` put the pin request in `data.object`
  (`cid`, `date_queued`, `host_nodes`, `status`).
- `ipfs.public.pin_by_cid_succeeded` puts the new file in `data.new_file`, next to the pin request
  in `data.object`.
- The two CAR-import events are generated from their schemas and name the event field `event`
  instead of `event_type`. `car_import_failed` has only `data.error` and `data.file_id`. Read
  `event.event_type ?? event.event`, as the examples do.
- The catalog's `pin_by_cid_succeeded` example prints `ipfs.public.pin_by_cid_created` as its
  `event_type`. That string is not a catalog event name; subscribe to and match
  `ipfs.public.pin_by_cid_succeeded`.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `ipfs.private.file_added` | A file is added to private IPFS | Index uploads, start processing |
| `ipfs.private.file_updated` | A private file's metadata is updated | Sync name or keyvalues |
| `ipfs.private.file_deleted` | A file is deleted from private IPFS | Remove from your database |
| `ipfs.public.file_added` | A file is added to public IPFS | Record the CID, publish links |
| `ipfs.public.file_updated` | A public file's metadata is updated | Sync name or keyvalues |
| `ipfs.public.file_deleted` | A file is deleted from public IPFS | Remove from your database |
| `ipfs.public.car_import_succeeded` | A CAR file imported successfully after upload | Mark an upload complete |
| `ipfs.public.car_import_failed` | A CAR file failed to import after upload | Surface the error, retry |
| `ipfs.public.pin_by_cid_added` | A pin by CID task is queued | Track a pending pin |
| `ipfs.public.pin_by_cid_succeeded` | Pinata pinned the content from the public IPFS network | Mark the pin done |
| `ipfs.public.pin_by_cid_failed` | Pinata couldn't retrieve the content for a pin by CID task | Alert, retry |

These 11 types are the documented ones, and the list may not be exhaustive. The examples handle
exactly these and acknowledge anything else with `200`.

## Full Event Reference

Browse every event and its schema in Pinata's [event catalog](https://event-types.pinata.cloud/),
and see the [webhook documentation](https://docs.pinata.cloud/account-management/webhooks).
