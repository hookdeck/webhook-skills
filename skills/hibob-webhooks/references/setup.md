# Setting Up HiBob (Bob) Webhooks

## Prerequisites

- A Bob account that can manage webhooks
- A publicly accessible HTTPS endpoint (max URL length 2048 characters). For local work use `npx hookdeck-cli listen 3000 hibob --path /webhooks/hibob`

## Get Your Signing Secret

The secret is shown in the Bob UI as part of the webhook configuration. Bob's docs do not give the menu path, so follow the linked "how to add the webhook in Bob" article from the [webhooks guide](https://apidocs.hibob.com/reference/getting-started-webhooks). Copy the secret exactly as shown and use it as a raw string (do not base64-decode it). Store it as `HIBOB_WEBHOOK_SECRET`.

## Register Your Endpoint

1. Add a webhook in Bob with your endpoint URL.
2. Bob immediately sends a `POST` containing `Ping test` (plain text) or `{"text":"Ping test"}`. Your endpoint must return `200` or Bob reports "Couldn't connect to destination".
3. Select the events to receive, for example `employee.created`, `employee.updated`, `employee.joined`, `employee.left`, `timeoff.request.requested`, `timeoff.request.approved`.
4. Fetch full record data with Bob's API using the IDs in each payload. The service user needs the matching API permissions.

For extra security you can also allowlist Bob's IPs (see Bob's help article linked from the guide).

## Test Mode vs Live Mode

Bob has no separate webhook test mode. Use a webhook inspector or the Hookdeck CLI to view the events Bob sends before writing your listener. Treat the payloads as HR data and trust the tool you send them to.

## Reactivating a Webhook

After 72 hours of failed deliveries the webhook becomes `Inactive` and no events are sent. Fix the listener, then reactivate the webhook in Bob.
