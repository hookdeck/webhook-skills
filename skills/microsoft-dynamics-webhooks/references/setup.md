# Setting Up Dynamics 365 (Dataverse) Webhooks

## Prerequisites

- A Dynamics 365 / Dataverse environment where you can register plug-in steps
  (System Administrator or equivalent)
- The **Plug-in Registration Tool**. Get it from
  [Dataverse development tools](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/download-tools-nuget)
- Your application's public HTTPS endpoint (port 443; only 80 and 443 work)

## Choose Your Secret

Dataverse doesn't give you a signing secret. You make one up and register it
as an HTTP header:

```bash
openssl rand -hex 32
```

Set the result as `DYNAMICS_WEBHOOK_SECRET` in your app. Dataverse stores the
authentication values in the endpoint's `AuthValue` property, and they can't be
read back, so keep your own copy.

## Register the Webhook

1. Open the Plug-in Registration Tool and connect to your environment.
2. Choose **Register → Register New WebHook** (or press `Ctrl+W`).
3. Fill in:
   - **Name**: a unique name, e.g. `Contact sync`
   - **Endpoint URL**: your URL, e.g. `https://example.com/webhooks/microsoft-dynamics`
     (for local development use the Hookdeck CLI URL)
   - **Authentication**: **HttpHeader**
4. Add a key/value pair: key `X-Webhook-Secret`, value your secret.
5. Save.

### Authentication options

| Type | What Dataverse sends | Recommendation |
|------|----------------------|----------------|
| **HttpHeader** | One or more key/value pairs as request headers | **Use this.** |
| **WebhookKey** | `?code=<value>` on the URL (suits Azure Functions) | Avoid: the secret is in the query string, and Hookdeck's source doesn't cover it |
| **HttpQueryString** | `?Key1=Value1&Key2=Value2` on the URL | Avoid, for the same reason |

## Register a Step

1. Right-click the webhook and choose **Register New Step**.
2. Set **Message** (`Create`, `Update` or `Delete`) and **Primary Entity**
   (e.g. `contact`).
3. For `Update`, set **Filtering Attributes** (e.g. `firstname,lastname`) so the
   step only fires for those columns. The tool prompts you if you don't.
4. Choose **Event Pipeline Stage of Execution** (`PostOperation` is typical) and
   **Execution Mode**:
   - **Asynchronous**: failures are recorded in a System Job; the user isn't blocked.
   - **Synchronous**: a failure from your endpoint fails the user's operation.
5. Register one step per message and table you want.

You can't pass configuration data to a webhook step.

## Check the Registration

List webhooks with the Web API:

```
GET [organization URI]/api/data/v9.0/serviceendpoints?$filter=contract eq 8&$select=serviceendpointid,name,authtype,url
```

For failed asynchronous deliveries, open **Settings → System → System Jobs** and
filter on **Status Reason: Failed**.

## Hookdeck Source

In Hookdeck, create a **Microsoft Dynamics** source. Enter the header name
(`X-Webhook-Secret`) and your secret. Requests without the right header are
rejected before they reach your app. Use the source URL as the webhook's
**Endpoint URL**, and register the same header key and value in the
**HttpHeader** option.

## Test

Create or update a row in the registered table (for example, edit a contact).
Use [Test WebHook registration with request logging site](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/test-webhook-registration)
to see the exact payload before pointing at your handler.
