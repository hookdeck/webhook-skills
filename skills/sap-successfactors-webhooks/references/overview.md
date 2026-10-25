# SAP SuccessFactors Webhooks Overview

## What Are SAP SuccessFactors Webhooks?

SAP SuccessFactors has no dedicated webhook feature. The closest equivalent is an **Integration
Center REST outbound integration**: you pick a starting entity, map the fields you want, and the
integration calls a REST URL you provide. SAP's REST outbound page sets the Trigger Type to
**Scheduled**: the integration runs on the schedule you choose or with **Run Now**. Intelligent
Services (event-triggered) integrations are not documented on that page and are not covered here.
Your endpoint is the "REST API URL" on the connection.

Requests are not signed. Authentication is whatever you set on the REST connection:

- **Basic Authentication**: User Name and Password, sent as an HTTP `Authorization: Basic` header.
  This is what this skill and Hookdeck's SAP SuccessFactors source verify.
- **OAuth**: the connection can use a configured OAuth 2.0 flow instead. Hookdeck's source does not
  cover OAuth.

> Use Basic authentication on the Integration Center REST destination. Hookdeck never answers with a 401 challenge, so the credentials have to arrive with each request; if deliveries show as failed verification, they are not.

## Event Types

SAP SuccessFactors defines **no event type strings** and the payload has **no event field**. What
arrives depends entirely on the integration author's configuration, so decide what a delivery
means from the integration you built (one URL per integration is the simplest way to tell them
apart) or from fields you mapped yourself.

| Delivery | What it is |
|----------|-----------|
| `POST` with a JSON or XML body | The mapped fields of the records the run selected |
| `GET` | A call with no body; any data is in the URL you configured |
| Empty request | Sent when a filtered run finds no records, unless "Exclude empty requests" is selected |

## Payload Structure

The body is the fields the author maps from the starting entity, in the **Payload Format** chosen
(JSON or XML). The example below is **illustrative only**; your field names will differ.

```json
{
  "userId": "example-1001",
  "firstName": "Ada",
  "lastName": "Lovelace",
  "department": "Engineering"
}
```

Do not assume JSON: parse it when the content type says so and otherwise keep the raw text.

## Delivery Behaviour

- Choose **GET** or **POST** on the REST operation ("Choose either GET or POST HTTP method for the
  connection"). POST is recommended.
- Answer within five minutes.
- `429`, `500`, `503` and `504` get an HTTP retry. If the retry fails the integration stops,
  unless **Execute with Exceptions** is enabled, in which case the run continues.
- `401` and `403` stop the integration even with Execute with Exceptions enabled.

## Full Reference

See [Configuring REST based Outbound Integration](https://help.sap.com/docs/SAP_SUCCESSFACTORS_PLATFORM/60ba370328e0485797adde67aee846a0/58e791b4e5db4ded8feea216e8a18e86.html).
