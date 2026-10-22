import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/seatable/route';

const SECRET = 'test_seatable_secret';

// Same algorithm as SeaTable: HMAC-SHA256 of the raw body, hex, "sha256=" prefix
function sign(payload: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function makePayload(opType: string, extra: Record<string, unknown> = {}): string {
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

function makeRequest(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/seatable', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/seatable', () => {
  beforeEach(() => {
    process.env.SEATABLE_WEBHOOK_SECRET = SECRET;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(['insert_row', 'create_row', 'modify_row', 'delete_row'])(
    'accepts a signed %s event',
    async (opType) => {
      const body = makePayload(opType);
      const res = await POST(makeRequest(body, { 'x-seatable-signature': sign(body, SECRET) }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    }
  );

  it('verifies regardless of content type', async () => {
    const body = makePayload('insert_row');
    const res = await POST(
      makeRequest(body, { 'content-type': 'text/plain', 'x-seatable-signature': sign(body, SECRET) })
    );
    expect(res.status).toBe(200);
  });

  it('returns 400 for a signature made with the wrong secret', async () => {
    const body = makePayload('insert_row');
    const res = await POST(makeRequest(body, { 'x-seatable-signature': sign(body, 'wrong') }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a tampered body', async () => {
    const header = sign(makePayload('insert_row'), SECRET);
    const res = await POST(makeRequest(makePayload('delete_row'), { 'x-seatable-signature': header }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await POST(makeRequest(makePayload('insert_row')));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a malformed signature', async () => {
    const res = await POST(makeRequest(makePayload('insert_row'), { 'x-seatable-signature': 'sha256=short' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, { 'x-seatable-signature': sign(body, SECRET) }));
    expect(res.status).toBe(400);
  });

  it('acknowledges unknown op_types with 200', async () => {
    const body = makePayload('something_new');
    const res = await POST(makeRequest(body, { 'x-seatable-signature': sign(body, SECRET) }));
    expect(res.status).toBe(200);
  });

  it('returns 500 when no secret is configured', async () => {
    delete process.env.SEATABLE_WEBHOOK_SECRET;
    const body = makePayload('insert_row');
    const res = await POST(makeRequest(body, { 'x-seatable-signature': sign(body, SECRET) }));
    expect(res.status).toBe(500);
  });
});
