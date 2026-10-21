// Generated with: green-api-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/green-api/route';
import { verifyGreenApiAuthorization, expectedAuthorization } from '../lib/green-api';

// webhookUrlToken as entered in GREEN-API, scheme included (the docs' recommended form).
const TOKEN = 'Bearer test_green_api_webhook_token';

beforeAll(() => {
  process.env.GREEN_API_WEBHOOK_URL_TOKEN = TOKEN;
});

const instanceData = { idInstance: 7103000000, wid: '79876543210@c.us', typeInstance: 'whatsapp' };

// Payloads taken from the GREEN-API notification format docs.
const incomingMessage = {
  typeWebhook: 'incomingMessageReceived',
  instanceData,
  timestamp: 1588091580,
  idMessage: 'F7AEC1B7086ECDC7E6E45923F5EDB825',
  senderData: {
    chatId: '79001234567@c.us',
    sender: '79001234567@c.us',
    chatName: 'John',
    senderName: 'John',
    senderContactName: 'John Doe',
  },
  messageData: {
    typeMessage: 'textMessage',
    textMessageData: { textMessage: 'I use Green-API to send this message to you!' },
  },
};

const outgoingStatus = {
  typeWebhook: 'outgoingMessageStatus',
  chatId: '79001234567@c.us',
  instanceData,
  timestamp: 1727691478,
  idMessage: '3EB0608D6A2901063D63',
  status: 'delivered',
  sendByApi: true,
};

const outgoingApiMessage = {
  typeWebhook: 'outgoingAPIMessageReceived',
  instanceData,
  timestamp: 1588091580,
  idMessage: 'BAE5F4886F6F2D05',
  senderData: { chatId: '79001234567@c.us', sender: '79876543210@c.us', chatName: 'John', senderName: '' },
  messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'Hello' } },
};

const stateChanged = {
  typeWebhook: 'stateInstanceChanged',
  instanceData: { idInstance: 1, wid: '', typeInstance: 'whatsapp' },
  timestamp: 1586700690,
  stateInstance: 'notAuthorized',
};

function makeRequest(body: unknown, authorization?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (authorization !== undefined) headers['authorization'] = authorization;
  return new NextRequest('http://localhost:3000/webhooks/green-api', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('expectedAuthorization', () => {
  it('keeps Bearer and Basic values as-is', () => {
    expect(expectedAuthorization('Bearer abc')).toBe('Bearer abc');
    expect(expectedAuthorization('Basic dXNlcjpwYXNz')).toBe('Basic dXNlcjpwYXNz');
  });

  it('defaults a bare token to Bearer', () => {
    expect(expectedAuthorization('abc')).toBe('Bearer abc');
  });
});

describe('verifyGreenApiAuthorization', () => {
  it('accepts the full header value', () => {
    expect(verifyGreenApiAuthorization(TOKEN, TOKEN)).toBe(true);
  });

  it('accepts Bearer <token> when a bare token is configured', () => {
    expect(verifyGreenApiAuthorization('Bearer abc', 'abc')).toBe(true);
  });

  it('accepts a Basic header when Basic is configured', () => {
    expect(verifyGreenApiAuthorization('Basic dXNlcjpwYXNz', 'Basic dXNlcjpwYXNz')).toBe(true);
  });

  it('rejects the bare token without the scheme', () => {
    expect(verifyGreenApiAuthorization('test_green_api_webhook_token', TOKEN)).toBe(false);
  });

  it('rejects the right token with the wrong scheme', () => {
    expect(verifyGreenApiAuthorization('Basic test_green_api_webhook_token', TOKEN)).toBe(false);
  });

  it('rejects a wrong token of equal length', () => {
    expect(verifyGreenApiAuthorization('Bearer test_green_api_webhook_XXXXX', TOKEN)).toBe(false);
  });

  it('rejects when no token is configured or no header is sent', () => {
    expect(verifyGreenApiAuthorization(TOKEN, undefined)).toBe(false);
    expect(verifyGreenApiAuthorization(null, TOKEN)).toBe(false);
  });
});

describe('POST /webhooks/green-api', () => {
  it('returns 401 without an Authorization header', async () => {
    const res = await POST(makeRequest(incomingMessage));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a wrong token', async () => {
    const res = await POST(makeRequest(incomingMessage, 'Bearer wrong'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for the bare token without the scheme', async () => {
    const res = await POST(makeRequest(incomingMessage, 'test_green_api_webhook_token'));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await POST(makeRequest('not json', TOKEN));
    expect(res.status).toBe(400);
  });

  it('returns 400 when typeWebhook is missing', async () => {
    const res = await POST(makeRequest({ foo: 'bar' }, TOKEN));
    expect(res.status).toBe(400);
  });

  it.each([
    ['incomingMessageReceived', incomingMessage],
    ['outgoingMessageStatus', outgoingStatus],
    ['outgoingAPIMessageReceived', outgoingApiMessage],
    ['stateInstanceChanged', stateChanged],
  ])('accepts %s with a valid Authorization header', async (_type, body) => {
    const res = await POST(makeRequest(body, TOKEN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts unknown typeWebhook values', async () => {
    const res = await POST(makeRequest({ typeWebhook: 'quotaExceeded', instanceData, timestamp: 1 }, TOKEN));
    expect(res.status).toBe(200);
  });
});
