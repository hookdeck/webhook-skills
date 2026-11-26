# Zoho CRM Webhooks Overview

## What Are Zoho CRM Webhooks?

A Zoho CRM webhook is a workflow action. You define the webhook once (Setup > Automation > Actions > Webhooks), then a **workflow rule** calls it when its criteria match: a record is created or edited, a field changes, a date arrives, and so on. Each call is an HTTP request to the URL you configured, carrying record data you pick with merge fields.

Typical uses: push a won deal to an accounting or ERP system, add a new lead to a mailing list, notify an internal service when a contact changes.

- Available to users with the **Manage workflow** permission.
- Supported modules: the primary modules (Leads, Contacts, Accounts, Deals and custom modules), plus Meetings and Tasks. Not Call Logs or Notes.
- Up to 6 webhooks per workflow rule (1 instant action and 5 time-based actions).
- Requests are **not signed**. Authenticate them with a secret header (see [verification.md](verification.md)).

## Request Shape

| Setting | Options |
|---------|---------|
| Method | `POST` (default), `PUT`, `GET`, `DELETE` |
| URL to Notify | Your endpoint, up to 300 characters; merge fields allowed; ports 80 or 443 only |
| Authorization Type | General (none, basic or API key/auth token) or a Connection |
| Header | Up to 10 parameters: Module Parameters (record fields) and Custom Parameters (static values) |
| Body | Form-Data or Raw (Text, JSON, HTML, XML) |

What each method sends, per the [create-webhook API reference](https://www.zoho.com/crm/developer/docs/api/v8/create-webhook.html):

| Method | Headers | Body | URL parameters |
|--------|---------|------|----------------|
| POST | Module and custom parameters | Form-data or raw | Not supported |
| PUT | Module and custom parameters | Form-data or raw | Not supported |
| GET | Not supported | Not supported | Module, custom and user-defined parameters |
| DELETE | Not supported | Not supported | Module, custom and user-defined parameters |

The help page shows Header settings for DELETE as well, but the API reference says headers apply "only for POST and PUT requests". Use POST or PUT whenever you need the secret header.

## Body Types

**Form-Data**: name/value pairs built from

- Module Parameters: a parameter name plus a record field (CRM modules, Users, Organization), up to 25.
- Custom Parameters: a static name and value, up to 10.
- User-defined Parameters: a name plus a value that can mix text and `#`-inserted merge fields.

**Raw**: up to 15,000 characters of your own Text, JSON, HTML or XML, with merge fields such as `${Deals.Deal Name}`. You can't mix Raw and Form-Data in one webhook.

The examples in this skill use an illustrative raw JSON template:

```json
{
  "module": "Deals",
  "id": "${Deals.Deal Id}",
  "deal_name": "${Deals.Deal Name}",
  "stage": "${Deals.Stage}",
  "amount": "${Deals.Amount}"
}
```

Zoho doesn't add an event name, record ID or delivery ID of its own. Include what your handler needs.

Merge fields that no longer exist (a deleted custom field, a deactivated integration) show up as `${Unsupported_Field}` in the editor.

## Delivery and Failures

- No response within **10 seconds** is a socket timeout.
- After a failure Zoho CRM sends a second notification **15 minutes** later. After that it sends nothing more for that workflow trigger.
- Zoho doesn't email you when a webhook stops working. Failure reasons include Bad Request, Unauthorized Request (your endpoint rejected the credential), Third-party error and Day limit reached.
- When the daily webhook limit for your edition is reached, the remaining calls aren't sent and the administrator is notified. The Free edition has no workflow webhooks.
- Setup > Automation > Actions > Webhooks has a usage graph for the last 7 days.

## The Notifications API Is Different

Zoho CRM also has a notifications API (`POST /crm/v8/actions/watch`) that calls a `notify_url` when records change. It doesn't use these webhook settings: it sends back a `token` (up to 50 characters) and `channel_id` **in the body** of each callback. A header check doesn't cover it, and neither does Hookdeck's Zoho CRM source type. If you use it, check the body `token` yourself. See [Enable notifications](https://www.zoho.com/crm/developer/docs/api/v8/notifications/enable.html).

## Full Reference

- [Configuring webhooks (help)](https://help.zoho.com/portal/en/kb/crm-v2/automate-business-processes/actions/articles/crm-v2-webhooks-workflow)
- [Create webhook API](https://www.zoho.com/crm/developer/docs/api/v8/create-webhook.html)
