# Debugging and Iterating

## Viewing Failed Deliveries

### Via Dashboard

1. Go to [Dashboard → Events](https://dashboard.hookdeck.com/events)
2. Filter by status: **Failed**, **Pending**, **Successful**
3. Click an event to see:
   - Request headers and body
   - Response from your server
   - Delivery attempts
   - Error messages

### Via CLI

```bash
# List recent events
hookdeck events list

# Get event details
hookdeck events get evt_xxxxx
```

## Understanding Error Classifications

Hookdeck classifies delivery failures:

| Status | Meaning | Action |
|--------|---------|--------|
| `FAILED` | Server returned 4xx/5xx | Fix code, replay |
| `PENDING` | Delivery in progress or scheduled retry | Wait or check logs |
| `SUCCESSFUL` | 2xx response | No action needed |

### Common Error Codes

| Code | Cause | Solution |
|------|-------|----------|
| `SIGNATURE_VERIFICATION_FAILED` | Invalid provider signature | Check source verification config |
| `TIMEOUT` | Server didn't respond in time | Optimize handler, return 200 faster |
| `CONNECTION_REFUSED` | Server unreachable | Check server is running |
| `SSL_ERROR` | HTTPS certificate issue | Fix certificate or use HTTP for local |

## Replaying Events

### Single Event Replay

1. Find the failed event in Dashboard
2. Click **Retry**
3. Event is re-delivered to your destination

### Bulk Replay

```bash
# Replay all failed events for a connection
hookdeck events retry --connection-id conn_xxxxx --status FAILED

# Replay events in a time range
hookdeck events retry --after 2024-01-01T00:00:00Z --before 2024-01-02T00:00:00Z
```

### Replay to Different Destination

Useful for testing fixes in a different environment:

1. Go to Dashboard → Events
2. Select events to replay
3. Choose **Replay to different destination**
4. Select your test destination

## Debugging Workflow

### 1. Identify the Issue

```
Event: payment_intent.succeeded
Status: FAILED
Response: 500 Internal Server Error
Body: {"error": "Database connection failed"}
```

### 2. Check Logs

Look at your server logs during the failed delivery:

```bash
# If using Docker
docker logs my-api

# If running locally
# Check terminal output
```

### 3. Fix the Code

```javascript
// Before: No error handling
app.post('/webhooks/stripe', async (req, res) => {
  await db.query('INSERT INTO payments...');  // Crashes if DB is down
  res.json({ received: true });
});

// After: Proper error handling
app.post('/webhooks/stripe', async (req, res) => {
  try {
    await db.query('INSERT INTO payments...');
    res.json({ received: true });
  } catch (err) {
    console.error('Database error:', err);
    // Return 503 so Hookdeck retries
    res.status(503).json({ error: 'Database unavailable' });
  }
});
```

### 4. Test Locally

```bash
# Start your updated server
npm start

# In another terminal, use hookdeck listen
hookdeck listen 3000 --path /webhooks
```

### 5. Replay the Event

Once your fix is deployed:
1. Go to Dashboard → Events
2. Find the failed event
3. Click **Retry**

## Monitoring and Alerts

### Dashboard Metrics

The Dashboard shows:
- Delivery success rate
- Average response time
- Failed events count
- Retry statistics

### Webhook Notifications

Configure alerts for failures:
1. Go to Dashboard → Settings → Notifications
2. Set up Slack, email, or webhook alerts
3. Get notified when events fail

## Debugging Signature Issues

### Check Source Configuration

```bash
# View source details
hookdeck source get stripe
```

Verify:
- Source type matches provider (e.g., `STRIPE`)
- Verification secret is correct
- Secret hasn't expired or been rotated

### Common Signature Problems

1. **Wrong secret**: Double-check the secret matches your provider's webhook secret
2. **Secret rotation**: Provider rotated secrets; update in Hookdeck
3. **Body modification**: If using transforms, signature may become invalid

### Testing Without Verification

For debugging, temporarily disable source verification:

```bash
hookdeck source update stripe --type WEBHOOK
```

**Remember to re-enable before production!**

## Best Practices

### Log Delivery IDs

Include the Hookdeck event ID in your logs:

```javascript
app.post('/webhooks', (req, res) => {
  const eventId = req.headers['x-hookdeck-event-id'];
  console.log(`Processing event: ${eventId}`);
  
  // Now you can search logs by event ID
});
```

### Return Meaningful Errors

Help debugging by returning descriptive errors:

```javascript
// Bad
res.status(500).send('Error');

// Good
res.status(500).json({
  error: 'processing_failed',
  message: 'Failed to update order status',
  event_id: req.headers['x-hookdeck-event-id']
});
```

### Use Idempotency

Events may be replayed multiple times. Ensure your handler is idempotent:

```javascript
// Check if already processed
const existing = await db.query(
  'SELECT 1 FROM processed_events WHERE id = $1',
  [event.id]
);

if (existing.rows.length > 0) {
  console.log('Event already processed, skipping');
  return res.json({ received: true, duplicate: true });
}
```

## Full Documentation

- [Hookdeck Events](https://hookdeck.com/docs/events)
- [Hookdeck Retries](https://hookdeck.com/docs/retries)
