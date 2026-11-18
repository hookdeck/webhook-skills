# Setting Up Zoho CRM Webhooks

## Prerequisites

- A Zoho CRM edition with workflow webhooks (Standard and above; not Free), and the **Manage workflow** permission.
- A public HTTPS endpoint on port 443. For local development: `npx hookdeck-cli listen 3000 zoho-crm --path /webhooks/zoho-crm`.
- A long random secret, for example `openssl rand -hex 32`.

## 1. Create the Webhook

1. Go to **Setup > Automation > Actions > Webhooks** and click **Configure Webhook**.
2. Enter a **Name** and choose the **Module** (for example Leads).
3. **Method**: choose **POST** (the default) or **PUT**. Only these two send headers, so only these two can carry the secret.
4. **URL to Notify**: your endpoint, e.g. `https://example.com/webhooks/zoho-crm`. Only ports 80 and 443 work.
5. **Authorization Type**: leave it on **General**.

## 2. Add the Secret Header

Under **Header**, add a **Custom Parameter**:

| Parameter Name | Parameter Value |
|----------------|-----------------|
| `X-Webhook-Secret` | your random secret |

Custom Parameters are static, which is what Zoho documents them for ("Auth tokens, security tokens, API key"). A webhook takes up to 10 header parameters in total. Zoho's API reference says a webhook with headers must also have at least one **Module Parameter** in the header, or it won't save; a record ID such as `lead_id` = `${Leads.Lead Id}` is a useful one.

Store the same name and value in your app:

```bash
ZOHO_CRM_WEBHOOK_HEADER=X-Webhook-Secret
ZOHO_CRM_WEBHOOK_SECRET=your-random-secret
```

Any header name works as long as both sides agree. Avoid `Authorization` if your platform or a proxy might rewrite it.

**Hookdeck:** on a Zoho CRM source (`ZOHO_CRM`), enter the same header name and value. Verification is optional on the source; leave it off only if something else checks the header.

## 3. Build the Body

Under **Body**, choose one:

- **Form-Data**: add Module Parameters (record fields), Custom Parameters or User-defined Parameters.
- **Raw**: pick JSON and type a template. Press `#` to insert merge fields:

```json
{
  "module": "Leads",
  "id": "${Leads.Lead Id}",
  "last_name": "${Leads.Last Name}",
  "email": "${Leads.Email}"
}
```

Include the module name (or use one URL per module) and the record ID: Zoho adds neither for you. Click **Save**.

## 4. Attach It to a Workflow Rule

1. Go to **Setup > Automation > Workflow Rules** and click **Create Rule**.
2. Choose the module, when the rule runs, and its conditions.
3. Under **Workflow Actions**, choose **Webhook** (Call Webhook), select your webhook and click **Associate**.
4. Click **Save**.

You can also create webhooks with the [create-webhook API](https://www.zoho.com/crm/developer/docs/api/v8/create-webhook.html). The secret header goes in `headers.custom_parameters`:

```json
{
  "webhooks": [
    {
      "name": "Lead to backend",
      "url": "https://example.com/webhooks/zoho-crm",
      "http_method": "POST",
      "module": { "api_name": "Leads" },
      "authentication": { "type": "general" },
      "headers": {
        "module_parameters": [{ "name": "lead_id", "value": "${!Leads.Id}" }],
        "custom_parameters": [{ "name": "X-Webhook-Secret", "value": "your-random-secret" }]
      },
      "body": {
        "type": "raw",
        "format": "JSON",
        "raw_data_content": "{\"module\":\"Leads\",\"id\":\"${!Leads.Id}\",\"email\":\"${!Leads.Email}\"}"
      }
    }
  ]
}
```

The API uses field API names in merge fields (`${!Leads.Email}`); the UI shows display names (`${Leads.Email}`). `module_parameters` is required whenever `headers` is set.

## 5. Test

Zoho CRM has no test button. Create or edit a record that meets the rule's criteria, then check that your endpoint received the request. With the Hookdeck CLI you can inspect the headers and body in its web UI:

```bash
npx hookdeck-cli listen 3000 zoho-crm --path /webhooks/zoho-crm
```

If nothing arrives, check the rule's criteria and the webhook usage graph under Setup > Automation > Actions > Webhooks. If your endpoint returned an error, Zoho sends one more attempt 15 minutes later and then gives up for that trigger.

## Rotating the Secret

Zoho sends one value at a time, so there's no overlap window. To rotate with no rejected requests, have the handler accept the old and new values for a short time, update the Custom Parameter in Zoho, then remove the old value.
