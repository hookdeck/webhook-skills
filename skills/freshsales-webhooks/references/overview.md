# Freshsales Webhooks Overview

## What Are Freshsales Webhooks?

In Freshsales (Freshworks CRM) a webhook is an action in a **Workflow**. When the workflow's
trigger and conditions are met (for example a deal is won or a contact is created), the **Trigger
webhook** action sends an HTTP request to a callback URL. A webhook is made of four settings:

- **Request type**
- **Callback URL**
- **Encoding type**
- **Content**

There are no webhook subscriptions, no signing secret and no fixed event catalogue.

## Request Types

| Request type | Purpose | Fields Freshsales sends |
|--------------|---------|-------------------------|
| `POST` | Create an object | URL, authentication (optional), custom headers (optional), encoding, content type, content |
| `PUT` / `PATCH` | Update an object | same as POST |
| `GET` | Fetch objects | URL, authentication (optional), custom headers (optional), no body |
| `DELETE` | Remove an object | same as GET |

The method is user-chosen, so a receiver should accept all five and handle an empty body.

## Encoding and Content

- **Encoding type:** JSON, XML or X-FORM-ENCODED. The examples parse JSON, so choose JSON.
- **Content:** **Simple** sends selected fields of the record in a predefined format. **Advanced**
  sends content you write, with placeholders (`{{deal.id}}`, `{{contact.email}}`,
  `{{sales_account.id}}`).
- Placeholders available: Contacts workflows offer Contact and the linked primary Account fields;
  Accounts workflows offer Account fields; Deals workflows offer Deal and related account fields.

## Event Types

Freshsales sends **no event type**. Nothing in the request says which workflow fired. The examples
tell payloads apart by shape, using this illustrative Advanced body:

| Illustrative payload | Handler action |
|----------------------|----------------|
| `{"deal": {"id": "{{deal.id}}", ...}}` | Logs a deal webhook (`deal` key) |
| `{"contact": {"id": "{{contact.id}}", ...}}` | Logs a contact webhook (`contact` key) |

These shapes are examples, not Freshsales-defined. If you want an event name, write a literal one
into each workflow's Advanced content (for example `"event": "deal_updated"`).

## Delivery

- Freshsales expects a response within 6 seconds; otherwise it reports a read timeout.
- On failure you get an email naming the failed Callback URL. Freshsales retries for an hour, then
  for the next 2 days, and then permanently terminates the request.
- The **Test** button sends sample data (ID placeholders become `12345`), so a test against a real
  endpoint may produce 404 or 400 responses downstream. Test the workflow itself for real data.

## Full Reference

See Freshsales' [webhook documentation](https://crmsupport.freshworks.com/support/solutions/articles/50000002418-how-to-use-workflows-with-webhooks-).
