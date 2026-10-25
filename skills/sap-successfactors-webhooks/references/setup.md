# Setting Up SAP SuccessFactors Webhooks

## Prerequisites

- A SAP SuccessFactors tenant with Integration Center access
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 sap-successfactors --path /webhooks/sap-successfactors` locally)

## Choose the Credentials

SAP SuccessFactors does not generate a secret for you. Pick a username and a strong password and
store them as `SAP_SUCCESSFACTORS_WEBHOOK_USERNAME` and `SAP_SUCCESSFACTORS_WEBHOOK_PASSWORD`.
You enter the same pair in Integration Center and, if you use Hookdeck, on the source.

> Use Basic authentication on the Integration Center REST destination. Hookdeck never answers with a 401 challenge, so the credentials have to arrive with each request; if deliveries show as failed verification, they are not.

The SAP docs don't say whether Basic credentials are sent preemptively. Hookdeck never sends a 401
challenge (no `WWW-Authenticate` round trip), so the credentials must arrive with each request.

## Register Your Endpoint

In Integration Center, create an integration with **Destination: REST** (the starting entity and
field mapping are yours to choose), then configure:

**REST Server Settings**

1. **REST API URL**: your endpoint, for example `https://example.com/webhooks/sap-successfactors`.
2. **Authentication Type**: **Basic Authentication**. (OAuth is available in SAP, but Hookdeck's
   SAP SuccessFactors source does not cover it.)
3. **User Name** and **Password**: the pair you chose above.

**REST Operation Settings**

1. **HTTP Method**: "Choose either GET or POST HTTP method for the connection". Use **POST**.
2. **Payload Format**: JSON or XML.
3. Optional: **Execute with Exceptions** and **Exclude empty requests** (stops empty requests when
   a filtered run finds no records).

Hookdeck's SAP SuccessFactors source pre-selects POST without managing the method. If the sender
uses any other method, allow it on the source too.

## Test

Use **Run Now** on the integration, or replay with curl (illustrative payload):

```bash
curl -X POST http://localhost:3000/webhooks/sap-successfactors \
  -u "$SAP_SUCCESSFACTORS_WEBHOOK_USERNAME:$SAP_SUCCESSFACTORS_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"userId":"example-1001","firstName":"Ada","department":"Engineering"}'
```

## Network Notes

Rely on the credentials and HTTPS rather than an IP allowlist.
