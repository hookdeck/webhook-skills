# Setting Up Deepgram Webhooks

## Prerequisites

- Deepgram account with API access
- Your application's webhook endpoint URL (must use port 80, 443, 8080, or 8443)
- Deepgram API key from your console

## Get Your API Credentials

1. Log into [Deepgram Console](https://console.deepgram.com/)
2. Navigate to API Keys section
3. Create or select an API key
4. Note both:
   - **API Key**: Used for authentication when making requests
   - **API Key ID**: Shown in console, used to verify `dg-token` header

## Configure Your Webhook Endpoint

### 1. Create Your Endpoint

Your webhook endpoint should:
- Accept POST requests
- Use one of the allowed ports (80, 443, 8080, 8443)
- Return 200-299 status for successful processing
- Handle JSON payloads with transcription results

### 2. Add Callback to Your Requests

Include the `callback` parameter when making transcription requests:

```bash
# Basic callback
curl -X POST \
  --header "Authorization: Token YOUR_API_KEY" \
  --header "Content-Type: audio/wav" \
  --data-binary @audio.wav \
  "https://api.deepgram.com/v1/listen?callback=https://your-domain.com/webhooks/deepgram"

# With additional features
curl -X POST \
  --header "Authorization: Token YOUR_API_KEY" \
  --header "Content-Type: audio/wav" \
  --data-binary @audio.wav \
  "https://api.deepgram.com/v1/listen?callback=https://your-domain.com/webhooks/deepgram&punctuate=true&diarize=true"
```

### 3. Using Basic Auth (Optional)

For additional security, embed credentials in your callback URL:

```bash
# Format: https://username:password@domain/path
curl -X POST \
  --header "Authorization: Token YOUR_API_KEY" \
  --header "Content-Type: audio/wav" \
  --data-binary @audio.wav \
  "https://api.deepgram.com/v1/listen?callback=https://myuser:mypass@your-domain.com/webhooks/deepgram"
```

## Testing Your Setup

### 1. Local Development with Hookdeck

```bash
# Install Hookdeck CLI
brew install hookdeck/hookdeck/hookdeck

# Create local tunnel
hookdeck listen 3000 --path /webhooks/deepgram

# Use the provided URL in your Deepgram requests
```

### 2. Send a Test Request

```bash
# Download a sample audio file
curl -O https://www.deepgram.com/examples/nasa-apollo-11.wav

# Send transcription request with callback
curl -X POST \
  --header "Authorization: Token YOUR_API_KEY" \
  --header "Content-Type: audio/wav" \
  --data-binary @nasa-apollo-11.wav \
  "https://api.deepgram.com/v1/listen?callback=YOUR_WEBHOOK_URL"
```

### 3. Verify the Response

You should receive:
1. Immediate response with `request_id`
2. Webhook POST to your endpoint within seconds/minutes (depending on file size)
3. Complete transcription results in the webhook payload

## Adding Metadata

Include custom metadata that will be returned in the webhook:

```bash
curl -X POST \
  --header "Authorization: Token YOUR_API_KEY" \
  --header "Content-Type: audio/wav" \
  --data-binary @audio.wav \
  "https://api.deepgram.com/v1/listen?callback=https://your-domain.com/webhooks/deepgram" \
  --data '{
    "metadata": {
      "user_id": "123",
      "session_id": "abc-def",
      "custom_field": "value"
    }
  }'
```

## Webhook Method Configuration

By default, callbacks use POST. To use PUT instead:

```bash
curl -X POST \
  --header "Authorization: Token YOUR_API_KEY" \
  --header "Content-Type: audio/wav" \
  --data-binary @audio.wav \
  "https://api.deepgram.com/v1/listen?callback=https://your-domain.com/webhooks/deepgram&callback_method=put"
```

## Monitoring and Debugging

### Check Request Status

Use the request_id to check transcription status:

```bash
curl -X GET \
  --header "Authorization: Token YOUR_API_KEY" \
  "https://api.deepgram.com/v1/listen/YOUR_REQUEST_ID"
```

### Common Issues

1. **Webhook not received**: Check port restrictions (must be 80, 443, 8080, or 8443)
2. **Authentication failures**: Verify your API Key ID matches the `dg-token` header
3. **Repeated webhooks**: Ensure you return 200-299 status; Deepgram retries on errors
4. **Timeout errors**: Deepgram waits for response; process asynchronously if needed