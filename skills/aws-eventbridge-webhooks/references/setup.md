# Setting Up Amazon EventBridge API Destinations

## Prerequisites

- An AWS account with permission to create EventBridge Connections (the connection stores its
  credentials in AWS Secrets Manager; `AmazonEventBridgeFullAccess` includes this)
- A publicly reachable HTTPS endpoint with a publicly trusted certificate (use
  `npx hookdeck-cli listen 3000 aws-eventbridge --path /webhooks/aws-eventbridge` locally)

## Choose Your Credentials

You choose the username and password. Generate a long random password and store both values as
`AWS_EVENTBRIDGE_WEBHOOK_USERNAME` and `AWS_EVENTBRIDGE_WEBHOOK_PASSWORD`.

## Create the Connection

1. Open the EventBridge console and go to **API destinations > Connections > Create connection**.
2. Enter a name and select **Basic** as the authorization type.
3. Enter the username and password from above and create the connection.

EventBridge sends them as `Authorization: Basic base64(username:password)` on every request.

## Create the API Destination

1. Go to **API destinations > Create API destination**.
2. Enter your endpoint URL (e.g. `https://example.com/webhooks/aws-eventbridge`).
3. Choose the HTTP method. Your endpoint should accept POST, PUT, PATCH, GET and DELETE.
4. Select the Connection and create the destination.

## Add It as a Rule or Pipe Target

1. Create a rule on the event bus with an event pattern, for example:
   `{"source": ["aws.ec2"], "detail-type": ["EC2 Instance State-change Notification"]}`
2. Choose **EventBridge API destination** as the target and select your destination.
3. Optionally add an input transformer. Without one the body is the full event envelope.

## Test

Send a custom event that matches the rule, or call the endpoint with curl:

```bash
curl -X POST http://localhost:3000/webhooks/aws-eventbridge \
  -u "$AWS_EVENTBRIDGE_WEBHOOK_USERNAME:$AWS_EVENTBRIDGE_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"version":"0","id":"1","detail-type":"OrderCreated","source":"com.example.orders","detail":{"orderId":"1234"}}'
```

## Rotating Credentials

Update the Connection's credentials in EventBridge and your environment variables together.
Requests that arrive with the old credentials get `401` and are retried.
