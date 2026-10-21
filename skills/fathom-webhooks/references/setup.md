# Setting Up Fathom Webhooks

## Prerequisites

- A Fathom account with API access (an API key is generated in the same settings page)
- A publicly reachable HTTPS endpoint, e.g. `https://example.com/webhooks/fathom`.
  For local development, use the Hookdeck CLI:

  ```bash
  npx hookdeck-cli listen 3000 fathom --path /webhooks/fathom
  ```

## Option 1: Create a Webhook in Settings

1. Open [User Settings → API Access](https://fathom.video/customize#api-access-header).
2. Generate an API key if you don't have one, then go to **Manage → Add Webhook**.
3. Enter the **Destination URL**.
4. Select which new recordings should trigger the webhook (see trigger scopes below).
5. Select what data to include: summary, transcript, action items, CRM matches.
6. Copy the webhook secret (`whsec_...`) and store it as `FATHOM_WEBHOOK_SECRET`.

## Option 2: Create a Webhook via the API

```bash
curl -X POST https://api.fathom.ai/external/v1/webhooks \
  -H "X-Api-Key: $FATHOM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "destination_url": "https://example.com/webhooks/fathom",
    "triggered_for": ["my_recordings", "shared_external_recordings"],
    "include_summary": true,
    "include_transcript": true,
    "include_action_items": true,
    "include_crm_matches": false
  }'
```

`destination_url` and `triggered_for` are required, and at least one `include_*`
flag must be `true`. The `201` response contains the webhook:

```json
{
  "id": "ikEoQ4bVoq4JYUmc",
  "url": "https://example.com/webhooks/fathom",
  "secret": "whsec_x6EV6NIAAz3ldclszNJTwrow",
  "created_at": "2025-06-30T10:40:46Z",
  "include_transcript": true,
  "include_crm_matches": false,
  "include_summary": true,
  "include_action_items": true,
  "triggered_for": ["my_recordings", "shared_external_recordings"]
}
```

Save both `secret` (for verification) and `id`. The ID is returned **only** at
creation. You need it to delete the webhook via `DELETE /webhooks/{id}`. If you
lose it, delete the webhook from Settings → API Access → Manage instead. Webhooks
created via the API also appear in Settings. Check the response body to confirm
the webhook was created as expected.

The SDKs expose the same call (`createWebhook` in `fathom-typescript`,
`create_webhook` in `fathom-python`).

## Trigger Scopes (`triggered_for`)

| Value | Fires for |
|-------|-----------|
| `my_recordings` | Your private recordings and those you've shared with individuals (on Team Plans, excludes recordings you've shared with teams) |
| `shared_external_recordings` | Recordings shared with you by other users (on Team Plans, excludes users on your Team Plan) |
| `my_shared_with_team_recordings` | Team Plans only: recordings you've shared with teams |
| `shared_team_recordings` | Team Plans only: recordings you can access from other users on your Team Plan |

## The Webhook Secret

- Format: `whsec_` followed by a base64 string. Each webhook has its own secret.
- Use the **base64-decoded** part after `whsec_` as the HMAC key. The SDKs handle this.
- If you run several webhooks (e.g. one per user), each needs its own secret.
  Look up the secret by destination URL.

## Testing

- Use **Send test payload** in the webhook's settings to send a sample. Settings
  shows "Test payload has been sent" even if your endpoint returned an error, so
  check your logs or the Hookdeck CLI UI.
- Or record a brief (~2 minute) meeting with real conversation. Shortly after it
  ends and a summary is generated, the webhook should arrive.
- During development you can skip verification, but turn it back on before going live.

## Troubleshooting: Webhook Not Firing

1. Did the call generate a summary? No summary means no webhook.
2. Does the recording match your `triggered_for` scopes? Private calls only fire `my_recordings`.
3. Was visibility correct when the call finalized? Later changes don't re-fire.
4. Does your endpoint return 2xx quickly?
5. Are firewalls or TLS certificates blocking delivery?
