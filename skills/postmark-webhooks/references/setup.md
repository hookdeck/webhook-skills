# Setting Up Postmark Webhooks

## Prerequisites

- Postmark account with at least one Server configured
- Your application's webhook endpoint URL (must be HTTPS in production)
- Decision on authentication method (Basic Auth or Token)

## Step 1: Access Webhook Settings

1. Log in to [Postmark](https://account.postmarkapp.com)
2. Select your Server from the Servers page
3. Navigate to **Webhooks** in the left sidebar

## Step 2: Add a Webhook

1. Click **Add webhook**
2. Enter your webhook URL with authentication:

   **Option A: Basic Authentication**
   ```
   https://username:password@yourdomain.com/webhooks/postmark
   ```

   **Option B: Token Authentication**
   ```
   https://yourdomain.com/webhooks/postmark?token=your-secret-token
   ```

   **Option C: Custom header.** Keep the URL plain and add a custom HTTP header with the token in the webhook's settings, or with `HttpHeaders` in the [Webhooks API](https://postmarkapp.com/developer/api/webhooks-api). This keeps the secret out of URLs and access logs. See [verification.md](verification.md#method-3-custom-header-token).

3. Select the events you want to receive:
   - **Bounce** - Hard bounces, soft bounces, and blocked emails
   - **Spam Complaint** - When recipients mark email as spam
   - **Opens** - Email open tracking (requires open tracking enabled)
   - **Link Clicks** - Click tracking (requires click tracking enabled)
   - **Delivery** - Successful delivery confirmations
   - **Subscription Changes** - Unsubscribe/resubscribe events

## Step 3: Configure Event Options

### Bounce Settings
- Include message content in bounce webhooks (optional)
- Choose bounce types to track

### Open Tracking
- Must be enabled on the Server's **Message Streams** settings
- Configure open tracking for Transactional and/or Broadcast streams

### Click Tracking
- Must be enabled on the Server's **Message Streams** settings
- Choose between tracking all links or specific links only

## Step 4: Test Your Webhook

1. After saving, click the **Test** button next to your webhook
2. Postmark will send a sample payload to your endpoint
3. Verify your endpoint returns a 2xx status code
4. Check your application logs to confirm receipt

## Message Streams

Postmark separates email into different streams:
- **Transactional** - Order confirmations, password resets, etc.
- **Broadcast** - Marketing emails, newsletters, etc.

Configure webhooks per stream or for all streams.

## Security Recommendations

1. **Always use HTTPS** in production
2. **Generate strong credentials**:
   ```bash
   # Generate a secure token
   openssl rand -base64 32
   ```

3. **Store credentials securely** - Use environment variables, not hard-coded values

4. **Consider IP allowlisting** - Configure your firewall to only accept requests from Postmark's IP ranges

## Retry Behavior

Outbound and inbound webhooks retry differently.

**Outbound** (Bounce, Delivery, Open, Click, SpamComplaint, SubscriptionChange) use one schedule for every event type: six retry attempts, 1, 5, 10, 10, 10 and 15 minutes after the previous attempt (roughly 50 minutes in total). After that, Postmark drops the event.
- **Retried:** 5xx, 408 Request Timeout, 429 Too Many Requests, timeouts and connection failures
- **Not retried (event dropped):** any other 4xx, such as 400, 401, 403 or 404

**Inbound** is retried after any non-200 response, 10 times: 1, 5, 10, 10, 10, 15 and 30 minutes, then 1, 2 and 6 hours. A 403 stops the retries. See [Errors and retries](https://postmarkapp.com/developer/webhooks/inbound-webhook) on the inbound webhook page.

Your endpoint should:
- Return 200 once the event is processed or handed to a durable queue
- Return 5xx when processing fails and a retry could succeed
- Only return 4xx when a retry can never succeed. For outbound events a 4xx loses the event, so don't reject valid events, such as a SubscriptionChange with `"MessageID": null`

Every outbound request includes an `X-PM-Retries-Remaining` header, and an `X-PM-Webhook-Trace-Id` header that stays the same across retries of one event. Use the trace ID to skip duplicates. Don't dedupe on `MessageID` alone: one message produces several events (Delivery, Open, Clicks) with the same `MessageID`. If you key on payload fields, combine `MessageID` with `RecordType` and the event's timestamp.

If an event type fails every delivery attempt, Postmark emails a warning. If nothing gets through for 48 hours, it disables that event type until you verify the webhook again.

See [Retry attempts](https://postmarkapp.com/developer/webhooks/webhooks-overview) in Postmark's webhooks overview for outbound.

## Multiple Endpoints

You can configure multiple webhook endpoints for redundancy:
- Each endpoint can receive the same or different events
- Useful for sending events to multiple systems
- Each endpoint has independent retry logic

## Troubleshooting

Common issues:

1. **Webhook not firing**
   - Verify events are enabled in webhook configuration
   - Check that open/click tracking is enabled if using those events
   - Ensure your server is sending emails through the correct Message Stream

2. **Authentication failures**
   - Verify credentials are correctly URL-encoded
   - Check environment variables match webhook URL
   - Ensure no extra spaces in credentials

3. **Payload parsing errors**
   - Postmark sends `Content-Type: application/json`
   - Each request contains a single event (not an array)
   - All timestamps are in ISO 8601 format