# Setting Up Azure DevOps Webhooks

## Prerequisites

- An Azure DevOps project, and membership in the **Project Collection Administrators** or
  **Project Administrators** group
- A publicly reachable **HTTPS** endpoint. Basic authentication requires HTTPS, and HTTP could
  send private data and the authentication header unencrypted. Use
  `npx hookdeck-cli listen 3000 azure-devops --path /webhooks/azure-devops` locally
- Webhooks can't target localhost (loopback) or special-range IPv4/IPv6 addresses. If your
  service is behind a VPN, allow Azure DevOps inbound IP addresses

## Create the Subscription

1. In your project go to **Project settings > Service hooks**
   (`https://dev.azure.com/<organization>/<project>/_settings/serviceHooks`).
2. Select **+** or **Create subscription**.
3. On the **Service** screen choose **Web Hooks** and select **Next**.
4. On the **Trigger** screen pick the event (for example **Code pushed**, **Pull request
   created**, **Work item created**, **Build completed**) and any filters, then **Next**.
5. On the **Action** screen set:
   - **URL**: `https://example.com/webhooks/azure-devops`
   - **Basic authentication username** and **Basic authentication password**: choose values and
     store them as `AZURE_DEVOPS_WEBHOOK_USERNAME` and `AZURE_DEVOPS_WEBHOOK_PASSWORD`
   - **Resource details to send**, **Messages to send**, **Detailed messages to send**: `All`
     (default), `Minimal` or `None`
6. Select **Test** to send a test event, then **Finish**.

This skill checks the basic authentication credentials. The **HTTP headers** setting is an
alternative (key:value lines, visible to anyone with access to the subscription) and is not covered.
Leave **Accept untrusted SSL certificates** off outside development.

One subscription fires for one trigger. To receive several event types at the same endpoint,
create one subscription per event, each with the same URL and credentials.

You can also create subscriptions programmatically; see
[Create a service hook subscription programmatically](https://learn.microsoft.com/en-us/azure/devops/service-hooks/create-subscription).

## Test

Use **Test** in the wizard, or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/azure-devops \
  -H "Content-Type: application/json" \
  -u "$AZURE_DEVOPS_WEBHOOK_USERNAME:$AZURE_DEVOPS_WEBHOOK_PASSWORD" \
  -d '{"eventType":"git.push","publisherId":"tfs","message":{"text":"pushed"},"resource":{"pushId":1}}'
```

## Rotating the Credential

The credential is static. If it leaks, edit the subscription's username and password and update the
two environment variables together; requests with the old credential will then return 401.
