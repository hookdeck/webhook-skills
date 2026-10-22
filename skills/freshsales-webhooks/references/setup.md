# Setting Up Freshsales Webhooks

## Prerequisites

- A Freshsales account with Workflows (webhooks are an action of a workflow)
- Permission to create workflows
- A public HTTPS URL for your endpoint. For local development, use
  `npx hookdeck-cli listen 3000 freshsales --path /webhooks/freshsales`

## Generate Your Shared Secret

Freshsales has no signing secret, so create your own:

```bash
openssl rand -hex 32
```

Put the value in your app's environment as `FRESHSALES_WEBHOOK_SECRET`. Use a hex value: Freshsales
doesn't run the trigger when a header contains spaces, so avoid values like `Bearer abc`. If you
do include a prefix anyway, store the exact whole string, since the examples compare the whole
header value.

## Create the Workflow and Webhook Action

1. In Freshsales go to **Admin Settings → Workflows** and create a workflow for the module you
   care about (Contacts, Accounts or Deals), with its trigger and conditions.
2. Add the action **Trigger webhook**.
3. **Request type:** choose `POST` (or `PUT`, `PATCH`, `GET`, `DELETE`). The examples accept all five.
4. **Callback URL:** `https://your-app.example.com/webhooks/freshsales` (or your Hookdeck Source URL).
5. Leave **Authentication** empty. Its delivery format isn't documented.
6. Click **Add custom headers** and enter one `header: value` pair per line, with no spaces inside
   the header name:
   ```
   X-Webhook-Secret: <your FRESHSALES_WEBHOOK_SECRET>
   ```
   To use another header name, also set `FRESHSALES_WEBHOOK_HEADER` in your app.
7. **Encoding type:** JSON.
8. **Content:** choose **Advanced** (recommended: Simple uses a predefined format) and write a body
   with placeholders, for example for a Deals workflow:
   ```json
   {
     "deal": {
       "id": "{{deal.id}}",
       "name": "{{deal.name}}",
       "amount": "{{deal.amount}}"
     }
   }
   ```
9. Click **Test** to send sample data, then save and enable the workflow.

## Test Mode vs Live Mode

There is no sandbox mode. The **Test** button sends sample data with placeholder values such as
`12345` for IDs. To confirm real data flows, test the workflow itself by performing the triggering
action on a record.

## Rotate the Secret

Change the header value in the workflow action and `FRESHSALES_WEBHOOK_SECRET` together. Do this
whenever the value may have leaked.
