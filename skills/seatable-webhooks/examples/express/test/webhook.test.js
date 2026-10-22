const request = require('supertest');
const crypto = require('crypto');

process.env.SEATABLE_WEBHOOK_SECRET = 'test_seatable_secret';

const { app, verifySeaTableWebhook } = require('../src/index');

// Same algorithm as SeaTable: HMAC-SHA256 of the raw body, hex, "sha256=" prefix
function sign(payload, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function makePayload(opType, extra = {}) {
  return JSON.stringify({
    event: 'update',
    data: {
      dtable_uuid: 'fae0a3a42ba94df88e8303fd385e37de',
      row_id: 'Fk-i7xZGS5iA5aSvaG5HAA',
      op_user: '4bc9a7c79c5942c5b6238413f2132bea@auth.local',
      op_type: opType,
      op_time: 1649922777.279,
      table_id: '9g8f',
      table_name: 'Opportunities',
      row_name: '',
      row_data: [],
      ...extra,
    },
  });
}

describe('verifySeaTableWebhook', () => {
  const secret = process.env.SEATABLE_WEBHOOK_SECRET;
  const body = Buffer.from(makePayload('insert_row'));

  it('accepts a valid signature', () => {
    expect(verifySeaTableWebhook(body, sign(body, secret), secret)).toBe(true);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verifySeaTableWebhook(body, sign(body, 'wrong'), secret)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const header = sign(body, secret);
    expect(verifySeaTableWebhook(Buffer.from(makePayload('delete_row')), header, secret)).toBe(false);
  });

  it('rejects missing or malformed headers', () => {
    expect(verifySeaTableWebhook(body, undefined, secret)).toBe(false);
    expect(verifySeaTableWebhook(body, 'sha256=short', secret)).toBe(false);
  });

  it('rejects when no secret is configured', () => {
    expect(verifySeaTableWebhook(body, sign(body, ''), '')).toBe(false);
  });
});

describe('POST /webhooks/seatable', () => {
  const secret = process.env.SEATABLE_WEBHOOK_SECRET;
  let logSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  const post = (body, headers = {}) =>
    request(app).post('/webhooks/seatable').set(headers).send(body);

  it.each(['insert_row', 'create_row', 'modify_row', 'delete_row'])(
    'accepts a signed %s event',
    async (opType) => {
      const body = makePayload(opType);
      const res = await post(body, {
        'Content-Type': 'application/json',
        'X-Seatable-Signature': sign(body, secret),
      });
      expect(res.status).toBe(200);
    }
  );

  it('verifies regardless of content type', async () => {
    const body = makePayload('insert_row');
    const res = await post(body, {
      'Content-Type': 'text/plain',
      'X-Seatable-Signature': sign(body, secret),
    });
    expect(res.status).toBe(200);
  });

  it('logs column changes for modify_row', async () => {
    const body = makePayload('modify_row', {
      row_data: [{ column_name: 'Prio', old_value: '', value: '381992' }],
    });
    await post(body, {
      'Content-Type': 'application/json',
      'X-Seatable-Signature': sign(body, secret),
    });
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Prio');
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await post(makePayload('insert_row'), {
      'Content-Type': 'application/json',
      'X-Seatable-Signature': 'sha256=' + 'a'.repeat(64),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await post(makePayload('insert_row'), { 'Content-Type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await post(body, {
      'Content-Type': 'text/plain',
      'X-Seatable-Signature': sign(body, secret),
    });
    expect(res.status).toBe(400);
  });

  it('acknowledges unknown op_types with 200', async () => {
    const body = makePayload('something_new');
    const res = await post(body, {
      'Content-Type': 'application/json',
      'X-Seatable-Signature': sign(body, secret),
    });
    expect(res.status).toBe(200);
  });
});
