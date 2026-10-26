// Generated with: omnara-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Omnara signing secrets are generated with `openssl rand -base64 32`: bare base64, no whsec_.
// The HMAC key is the base64-decoded value.
const KEY = Buffer.from('omnara-test-signing-key-0123456789');
const SECRET = KEY.toString('base64');

process.env.OMNARA_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

/** Sign exactly like Omnara does (Standard Webhooks, HMAC-SHA256, base64). */
function sign(rawBody, id, timestamp, key = KEY) {
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`, 'utf8').digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

function signedHeaders(rawBody, { id, timestamp, key, signature, prefix = 'webhook' } = {}) {
  const msgId = id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(timestamp ?? now());
  return {
    'content-type': 'application/json',
    [`${prefix}-id`]: msgId,
    [`${prefix}-timestamp`]: ts,
    [`${prefix}-signature`]: signature ?? sign(rawBody, msgId, ts, key),
  };
}

function post(rawBody, headers) {
  return request(app).post('/webhooks/omnara').set(headers).send(rawBody);
}

const ID = 'evt_5n6a2bfgik7mv4qtrwz3jehcyd';
const timeline = (event, extra) => ({
  event,
  data: {
    id: ID,
    org_id: 'org_5n6a2bfgik7mv4qtrwz3jehcyd',
    project_id: 'proj_5n6a2bfgik7mv4qtrwz3jehcyd',
    agent_id: 'agt_5n6a2bfgik7mv4qtrwz3jehcyd',
    turn_id: 'trn_5n6a2bfgik7mv4qtrwz3jehcyd',
    turn_sequence: 1,
    is_opening_event: false,
    sequence: 3,
    event_kind: event,
    created_at: '2026-09-18T12:00:00Z',
    ...extra,
  },
});

const payloads = {
  agent_input: timeline('agent_input', {
    agent_input_id: 'ain_5n6a2bfgik7mv4qtrwz3jehcyd',
    input_kind: 'content',
    content_blocks: [{ type: 'text', text: 'Summarize the report.' }],
  }),
  model_output: timeline('model_output', {
    model_call_context_id: 'mcc_5n6a2bfgik7mv4qtrwz3jehcyd',
    stop_reason: 'end_turn',
    content_blocks: [{ type: 'text', text: 'The report shows steady growth.' }],
  }),
  tool_result: timeline('tool_result', {
    tool_call_id: 'tcl_5n6a2bfgik7mv4qtrwz3jehcyd',
    outcome: 'succeeded',
    content_blocks: [{ type: 'text', text: 'Ticket created.' }],
  }),
  context_checkpoint: timeline('context_checkpoint', {
    context_checkpoint_id: 'ccp_5n6a2bfgik7mv4qtrwz3jehcyd',
    summarized_through_event_sequence: 2,
    summary: 'The user requested a report summary.',
  }),
  tool_call_update: {
    event: 'tool_call_update',
    data: {
      tool_call_id: 'tcl_5n6a2bfgik7mv4qtrwz3jehcyd',
      agent_id: 'agt_5n6a2bfgik7mv4qtrwz3jehcyd',
      state: 'awaiting_permission',
      interaction_update: { id: 'int_5n6a2bfgik7mv4qtrwz3jehcyd', interaction_kind: 'permission', state: 'open' },
    },
  },
};

beforeEach(() => {
  process.env.OMNARA_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('Omnara webhook handler', () => {
  describe('valid deliveries', () => {
    it.each(Object.keys(payloads))('accepts a signed %s event', async (type) => {
      const raw = JSON.stringify(payloads[type]);
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, event: type });
    });

    it('accepts a delivery sent with svix-* headers instead of webhook-* headers', async () => {
      const raw = JSON.stringify(payloads.tool_result);
      const res = await post(raw, signedHeaders(raw, { prefix: 'svix' }));
      expect(res.status).toBe(200);
    });

    it('accepts the whsec_-prefixed form of the same secret', async () => {
      process.env.OMNARA_WEBHOOK_SECRET = `whsec_${SECRET}`;
      const raw = JSON.stringify(payloads.agent_input);
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
    });

    it('accepts when any space-separated v1 entry matches', async () => {
      const raw = JSON.stringify(payloads.model_output);
      const id = 'msg_rotation';
      const ts = String(now());
      const signature = `${sign(raw, id, ts, Buffer.from('old-key'))} ${sign(raw, id, ts)}`;
      const res = await post(raw, signedHeaders(raw, { id, timestamp: ts, signature }));
      expect(res.status).toBe(200);
    });

    it('verifies any content type (raw bytes)', async () => {
      const raw = JSON.stringify(payloads.tool_call_update);
      const headers = { ...signedHeaders(raw), 'content-type': 'application/cloudevents+json' };
      const res = await post(raw, headers);
      expect(res.status).toBe(200);
    });

    it('returns 200 for unhandled event types', async () => {
      const raw = JSON.stringify({ event: 'something_new', data: {} });
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(res.body.event).toBe('something_new');
    });
  });

  describe('rejections', () => {
    it('rejects a wrong signature', async () => {
      const raw = JSON.stringify(payloads.agent_input);
      const res = await post(raw, signedHeaders(raw, { key: Buffer.from('another-key') }));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid signature');
    });

    it('rejects a tampered body', async () => {
      const raw = JSON.stringify(payloads.agent_input);
      const headers = signedHeaders(raw);
      const res = await post(raw.replace('Summarize', 'Delete'), headers);
      expect(res.status).toBe(400);
    });

    it('rejects when only an unsupported signature version is sent', async () => {
      const raw = JSON.stringify(payloads.agent_input);
      const headers = signedHeaders(raw);
      headers['webhook-signature'] = headers['webhook-signature'].replace('v1,', 'v1a,');
      const res = await post(raw, headers);
      expect(res.status).toBe(400);
    });

    it('rejects unsigned deliveries (no webhook-signature header)', async () => {
      const raw = JSON.stringify(payloads.agent_input);
      const headers = signedHeaders(raw);
      delete headers['webhook-signature'];
      const res = await post(raw, headers);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing required webhook headers');
    });

    it('rejects a request with no webhook headers at all', async () => {
      const res = await post('{}', { 'content-type': 'application/json' });
      expect(res.status).toBe(400);
    });

    it('rejects a timestamp outside the 5-minute window', async () => {
      const raw = JSON.stringify(payloads.agent_input);
      const res = await post(raw, signedHeaders(raw, { timestamp: now() - 600 }));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Timestamp too old');
    });

    it('rejects a signed body that is not JSON', async () => {
      const raw = 'not json';
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid JSON');
    });

    it('fails closed (500) when the secret is not configured', async () => {
      delete process.env.OMNARA_WEBHOOK_SECRET;
      const raw = JSON.stringify(payloads.agent_input);
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(500);
    });
  });

  it('serves a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
