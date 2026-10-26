# Setting Up Forgejo Webhooks

## Prerequisites

- A Forgejo account (for example on Codeberg) with admin rights on the repository or organization, or instance admin rights for system webhooks
- Your application's public webhook endpoint URL (use `npx hookdeck-cli listen 3000 forgejo --path /webhooks/forgejo` locally)

## Important: Secret, Method and Content Type

Set a secret on the Forgejo webhook. Without one, deliveries are unsigned and fail verification. Set the webhook's HTTP method to POST and its content type to application/json. Form-encoded and GET deliveries sign the JSON payload rather than the request body and fail verification.

## Get Your Signing Secret

The Secret is a value **you choose** when creating the webhook; Forgejo does not generate one. Pick a long random string, store it as `FORGEJO_WEBHOOK_SECRET`, and paste the same value into the webhook's **Secret** field. It is used as plain UTF-8 text.

## Register Your Endpoint

1. Open the repository (or organization) and go to **Settings → Webhooks** (`/:username/:reponame/settings/hooks`).
2. Click **Add webhook → Forgejo**.
3. **Target URL**: your endpoint, e.g. `https://example.com/webhooks/forgejo`.
4. **HTTP method**: `POST`.
5. **POST content type**: `application/json`.
6. **Secret**: your signing secret.
7. **Authorization header** (optional): Forgejo can send an extra `Authorization` header to the target; the value is stored encrypted.
8. Choose the trigger events (or "All events") and keep **Active** checked.
9. Save, then use **Test Delivery** to send a `push` event.

## Test Mode vs Live Mode

Forgejo has no test mode. **Test Delivery** sends a real delivery for the repository's latest push, and **Recent Deliveries** shows the exact request headers and body of each attempt, which helps when debugging signature failures.
