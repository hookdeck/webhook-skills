# Azure Logic Apps Webhooks Overview

## What Are Azure Logic Apps Webhooks?

Azure Logic Apps workflows call external endpoints with the built-in **HTTP** action
(anywhere in a workflow) or the **HTTP** trigger (polling on a schedule). When your
service is the destination, each run of that action is effectively a webhook: Logic
Apps sends an HTTP request whose method, URI, headers, query and body are all defined
in the workflow. Power Automate's HTTP action works the same way.

Unlike most webhook providers, Logic Apps:

- **does not sign** the request (no HMAC, no signature header, no timestamp),
- **has no event catalogue**: the body is whatever the workflow author puts in **Body**,
- **sends no delivery id**.

Authentication comes from the action's **Authentication** setting or from headers
you add yourself. See [verification.md](verification.md).

## Event Types

There are none. Treat every request as a **workflow call**. If one endpoint receives
calls from several workflows or branches, add a routing field in the workflow, for
example:

```json
{
  "type": "order.approved",
  "orderId": "@{triggerBody()?['orderId']}",
  "runId": "@{workflow()['run']['name']}"
}
```

`type` and `runId` here are your own convention, not something Logic Apps adds.

## Request Shape

| Part | Source |
|------|--------|
| Method | Action's **Method**: `GET`, `PUT`, `POST`, `PATCH` or `DELETE` |
| URL | Action's **URI** plus **Queries** |
| Headers | Action's **Headers**, plus `Authorization` from **Authentication** |
| Body | Action's **Body**: JSON object by default, or text, `application/x-www-form-urlencoded`, or multipart via `$content-type` / `$multipart` |

Logic Apps silently drops some headers you set on the action, including `Accept-*`
(except `Accept-version`), `Allow`, `Expires`, `Host`, `Last-Modified`, `Origin`,
`Set-Cookie`, `Transfer-Encoding`, and `Content-*` other than `Content-Disposition`,
`Content-Encoding` and `Content-Type` (those three are dropped on `GET`).

## How Logic Apps Reads Your Response

- `2xx` (other than `202`) = success; the action's outputs expose your `statusCode`,
  `headers` and `body` to later steps.
- `202 Accepted` in a **stateful** workflow starts the asynchronous request-reply
  pattern: the action polls your `Location` header until a non-202 response (unless
  **Asynchronous pattern** is turned off). Stateless workflows don't poll.
- `408`, `429`, `5xx` and connectivity errors are retried by the **Default** retry
  policy: up to 4 retries at exponentially increasing intervals. A `Retry-After`
  header on `429` or `202` sets the wait.
- Other `4xx` (including `401`) fail the action immediately.
- Outbound timeout: 120 s (Consumption), 225 s default (Standard).

If your handler does slow work, acknowledge with `200` and process asynchronously.

## Full Reference

- [Call external HTTP or HTTPS endpoints from workflows](https://learn.microsoft.com/en-us/azure/connectors/connectors-native-http)
- [HTTP action schema](https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-workflow-actions-triggers#http-action)
- [Secure access and data in Azure Logic Apps](https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-securing-a-logic-app)
- [Retry policies](https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-exception-handling#retry-policies)
