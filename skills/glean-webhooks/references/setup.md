# Setting Up Glean Trigger Webhooks

Glean has no dashboard page for webhooks: triggers are created through the
Platform API.

## Prerequisites

- A Glean deployment with the Triggers API enabled
- A token with the `triggers:write` scope (or the legacy `TRIGGERS` scope) and `triggers:read` to browse presets
- A public `https://` URL for your receiver (use a tunnel locally, see below)

## How Do I Create a Trigger and Get the Signing Secret?

All Triggers API calls need `Authorization: Bearer <token>` and the experimental
header `x-glean-include-experimental: true`.

1. List presets: `GET /api/trigger-presets` (filter with `datasource`). Preset ids are per deployment.
2. Read one: `GET /api/trigger-presets/{preset_id}` for its `inputs` array.
3. Optionally preview: `POST /api/trigger-presets/{preset_id}/events/search`.
4. Create the trigger:

   ```bash
   curl -X POST "$GLEAN_SERVER_URL/api/triggers" \
     -H "Authorization: Bearer $GLEAN_TOKEN" \
     -H "x-glean-include-experimental: true" \
     -H "Content-Type: application/json" \
     -d '{
       "preset_id": "<preset id from step 1>",
       "inputs": { },
       "delivery": {
         "webhook_url": "https://your-app.com/webhooks/glean",
         "auth": { "type": "BEARER", "secret": "<optional receiver credential>" }
       }
     }'
   ```

5. Copy `trigger.signing_secret` (starts with `whsec_`) from the response. **It is returned only at creation and cannot be read back.** Store it as `GLEAN_SIGNING_SECRET`.

## Optional Bearer Credential

`delivery.auth` is optional. With `type: BEARER`, Glean sends
`Authorization: Bearer <secret>` in addition to the signature. The credential is
write-only, cannot be removed in place (delete and recreate the trigger), and
while it is set `webhook_url` cannot be changed. Check it as an extra, not instead
of the signature.

## Managing Triggers

- `PATCH /api/triggers/{trigger_id}` with `"status": "DISABLED"` stops delivery but keeps the signing secret.
- `GET /api/triggers` lists your own triggers; `DELETE /api/triggers/{trigger_id}` returns 204.

## Testing

Glean cannot deliver to localhost. Expose your receiver with:

```bash
npx hookdeck-cli listen 3000 glean --path /webhooks/glean
```

and use the printed HTTPS URL as `webhook_url`. Matching events only fire
forward from trigger creation, so schedule a real matching item (for example a
calendar event) or sign a fixture yourself using the algorithm in [verification.md](verification.md).
