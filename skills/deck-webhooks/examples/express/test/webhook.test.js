// Generated with: deck-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Deck secrets are caller-generated: "whsec_" + base64(random bytes).
// The HMAC key is the base64-DECODED part after "whsec_".
const SECRET = 'whsec_' + Buffer.from('deck-test-signing-key-0123456789').toString('base64');
const PREVIOUS_SECRET =
  'whsec_' + Buffer.from('deck-previous-signing-key-012345').toString('base64');

process.env.DECK_WEBHOOK_SECRET = SECRET;
delete process.env.DECK_WEBHOOK_SECRET_PREVIOUS;

const { app } = require('../src/index');

/** Sign exactly like Deck (Standard Webhooks). */
function sign(rawBody, id, timestamp, secret = SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

function signedHeaders(rawBody, { id, timestamp, secret, signature } = {}) {
  const msgId = id || `evt_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(timestamp ?? now());
  return {
    'content-type': 'application/json',
    'webhook-id': msgId,
    'webhook-timestamp': ts,
    'webhook-signature': signature ?? sign(rawBody, msgId, ts, secret),
  };
}

function post(rawBody, headers) {
  return request(app).post('/webhooks/deck').set(headers).send(rawBody);
}

let counter = 0;
function event(type, data) {
  counter += 1;
  return {
    id: `evt_test${counter}_${Date.now()}`,
    object: 'event',
    type,
    data,
    created_at: '2025-01-15T09:31:15Z',
  };
}

const taskRunCompleted = () =>
  event('task_run.completed', {
    id: 'trun_a1b2c3d4',
    object: 'task_run',
    status: 'completed',
    result: 'success',
    task_id: 'task_a1b2c3d4',
    workflow_id: '',
    credential_id: 'cred_a1b2c3d4',
    session_id: 'sess_a1b2c3d4',
    agent_id: 'agt_a1b2c3d4',
    source_id: 'src_a1b2c3d4',
    runtime_ms: 12453,
    created_at: '2025-01-15T09:30:00Z',
    updated_at: '2025-01-15T09:31:15Z',
  });

beforeEach(() => {
  process.env.DECK_WEBHOOK_SECRET = SECRET;
  delete process.env.DECK_WEBHOOK_SECRET_PREVIOUS;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('valid signatures', () => {
  it('accepts task_run.completed', async () => {
    const body = JSON.stringify(taskRunCompleted());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts task_run.interaction_required with an interaction object', async () => {
    const body = JSON.stringify(
      event('task_run.interaction_required', {
        id: 'trun_a1b2c3d4',
        object: 'task_run',
        status: 'interaction_required',
        result: '',
        task_id: 'task_a1b2c3d4',
        workflow_id: '',
        credential_id: 'cred_a1b2c3d4',
        session_id: 'sess_a1b2c3d4',
        agent_id: 'agt_a1b2c3d4',
        source_id: 'src_a1b2c3d4',
        created_at: '2025-01-15T09:30:00Z',
        updated_at: '2025-01-15T09:30:30Z',
        interaction: {
          type: 'mfa',
          message: 'Enter the 6-digit code sent to your phone',
          fields: [{ name: 'code', type: 'string', label: 'Verification code' }],
        },
      })
    );
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('needs mfa'));
  });

  it('accepts credential.verified', async () => {
    const body = JSON.stringify(
      event('credential.verified', {
        id: 'cred_a1b2c3d4',
        object: 'credential',
        status: 'verified',
        external_id: 'user-12345',
        source_id: 'src_a1b2c3d4',
        auth_method: 'username_password',
        created_at: '2025-01-15T09:28:00Z',
        updated_at: '2025-01-15T09:30:00Z',
      })
    );
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('accepts workflow_run.completed (workflow_run_id, not id)', async () => {
    const body = JSON.stringify(
      event('workflow_run.completed', {
        workflow_run_id: 'wrun_a1b2c3d4',
        workflow_id: 'wflo_a1b2c3d4',
        org_id: 'org_a1b2c3d4',
        status: 'completed',
        result: 'success',
        session_id: 'sess_a1b2c3d4',
        trigger_id: null,
        created_by: 'usr_a1b2c3d4',
        created_at: '2025-01-15T09:30:00Z',
        updated_at: '2025-01-15T09:32:13Z',
      })
    );
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('wrun_a1b2c3d4'));
  });

  it('accepts test.ping', async () => {
    const body = JSON.stringify(event('test.ping', { ok: true }));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify(event('something.new', {}));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('accepts when any one of several space-separated signatures matches', async () => {
    const body = JSON.stringify(taskRunCompleted());
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('returns 200 for duplicate deliveries of the same event id', async () => {
    const body = JSON.stringify(taskRunCompleted());
    const first = await post(body, signedHeaders(body));
    const second = await post(body, signedHeaders(body));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const body = JSON.stringify(taskRunCompleted());
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify(taskRunCompleted());
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with a different secret', async () => {
    const other = 'whsec_' + Buffer.from('some-other-secret-key-0123456789').toString('base64');
    const body = JSON.stringify(taskRunCompleted());
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(taskRunCompleted());
    const headers = signedHeaders(body);
    const res = await post(body.replace('success', 'failure'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the 5-minute tolerance', async () => {
    const body = JSON.stringify(taskRunCompleted());
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects signatures keyed with the undecoded secret string', async () => {
    const body = JSON.stringify(taskRunCompleted());
    const id = 'evt_undecoded';
    const ts = String(now());
    const wrong = crypto
      .createHmac('sha256', SECRET.slice('whsec_'.length))
      .update(`${id}.${ts}.${body}`)
      .digest('base64');
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: `v1,${wrong}` }));
    expect(res.status).toBe(400);
  });
});

describe('secret rotation', () => {
  it('accepts deliveries signed with DECK_WEBHOOK_SECRET_PREVIOUS', async () => {
    process.env.DECK_WEBHOOK_SECRET_PREVIOUS = PREVIOUS_SECRET;
    const body = JSON.stringify(taskRunCompleted());
    const res = await post(body, signedHeaders(body, { secret: PREVIOUS_SECRET }));
    expect(res.status).toBe(200);
  });

  it('rejects the previous secret once it is removed', async () => {
    const body = JSON.stringify(taskRunCompleted());
    const res = await post(body, signedHeaders(body, { secret: PREVIOUS_SECRET }));
    expect(res.status).toBe(400);
  });
});

describe('fail closed', () => {
  it('returns 500 when DECK_WEBHOOK_SECRET is not set', async () => {
    delete process.env.DECK_WEBHOOK_SECRET;
    const body = JSON.stringify(taskRunCompleted());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
