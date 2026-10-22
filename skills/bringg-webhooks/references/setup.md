# Setting Up Bringg Webhooks

## Prerequisites

- A Bringg account with the **Admin** user type
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 bringg --path /webhooks/bringg` while developing)

## Choose and Store Your Secret

Bringg gives you no signing secret. You make one up and add it to the webhook as a static
header (Key-Value pair):

1. Generate a token: `openssl rand -hex 32`
2. Pick a header Key. `Authorization` with Value `Bearer <token>` is common; `application-key`
   with Value `<token>` works equally well. Bringg's own example uses both.
3. Set the examples' env vars to match **exactly**:
   - `BRINGG_WEBHOOK_HEADER` = the Key (case-insensitive)
   - `BRINGG_WEBHOOK_SECRET` = the whole Value, including any `Bearer ` prefix you typed

## Register Your Endpoint

1. In Bringg, select your username in the sidebar, then **Settings > Platform Integrations >
   Webhooks > Add Webhook**.
2. Choose the event from the **Webhook Name** dropdown (e.g. Order Created).
3. Enter your URL(s). **Add URL** sends the same webhook to several systems.
4. (Optional) **Authentication method**: pick a configured JWT or OAuth 2.0 method. This skill
   does not cover those (they need custom receiver code); leave it empty for Static Headers.
5. **Headers**: add your Key-Value pair here. This is the Static Header the receiver checks.
6. (Optional) Add a filter on an event field, or enable **Flexible Webhook** to choose payload
   fields.
7. **Save**. Repeat for each event you want (registration is per event).

Static headers can also be defined on an authentication method (**Settings > Platform
Integrations > Authentication Methods > Add Authentication Method**, *Use for* = Webhooks) and
reused across webhooks.

## Test

Trigger the event in Bringg (e.g. create an order) and check your endpoint logs. A `401` means
the header Key or Value doesn't match your env vars exactly. Bringg can report webhooks it
failed to deliver via the Generate Undelivered Webhooks Report API.
