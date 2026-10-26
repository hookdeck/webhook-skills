const request = require('supertest');
const zlib = require('zlib');

const SECRET = 'Bearer 9f2c7d1e4b8a4c36a1d05e7b3c9f8a21';
process.env.MEILISEARCH_AUTHORIZATION = SECRET;

const app = require('../src/index');
const { verifyMeilisearchRequest, parseTasks } = require('../src/index');

// Task objects as returned by the Tasks API (trimmed)
const tasks = [
  { uid: 1, indexUid: 'movies', status: 'succeeded', type: 'documentAdditionOrUpdate', details: { receivedDocuments: 10, indexedDocuments: 10 } },
  { uid: 2, indexUid: 'movies', status: 'failed', type: 'settingsUpdate', error: { message: 'Invalid settings', code: 'invalid_settings' } },
  { uid: 3, indexUid: 'old', status: 'succeeded', type: 'indexDeletion', details: { deletedDocuments: 4 } },
];
const ndjson = tasks.map((t) => JSON.stringify(t)).join('\n') + '\n';
const gz = zlib.gzipSync(ndjson);

function post({ body = gz, headers = {}, gzip = true, contentType = 'application/x-ndjson' } = {}) {
  const req = request(app).post('/webhooks/meilisearch').set('Content-Type', contentType);
  if (gzip) req.set('Content-Encoding', 'gzip');
  return req.set(headers).send(body);
}

describe('Meilisearch webhook', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepts a gzipped multi-line ndjson body with the full Authorization value', async () => {
    const res = await post({ headers: { Authorization: SECRET } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, tasks: 3 });
  });

  it('accepts an uncompressed ndjson body', async () => {
    const res = await post({ body: ndjson, gzip: false, headers: { Authorization: SECRET } });
    expect(res.status).toBe(200);
    expect(res.body.tasks).toBe(3);
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post()).status).toBe(401);
  });

  it('rejects a wrong secret', async () => {
    expect((await post({ headers: { Authorization: 'Bearer nope' } })).status).toBe(401);
  });

  it('rejects the token without the "Bearer " prefix', async () => {
    const res = await post({ headers: { Authorization: SECRET.replace('Bearer ', '') } });
    expect(res.status).toBe(401);
  });

  it('checks the credential before decoding the body', async () => {
    const res = await post({ body: Buffer.from('not gzip'), headers: { Authorization: 'Bearer nope' } });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a body that claims gzip but is not', async () => {
    const res = await post({ body: Buffer.from('not gzip'), headers: { Authorization: SECRET } });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid ndjson', async () => {
    const bad = zlib.gzipSync('{"uid":1}\nnot json\n');
    expect((await post({ body: bad, headers: { Authorization: SECRET } })).status).toBe(400);
  });

  it('returns 400 for a line that is not an object', async () => {
    const bad = zlib.gzipSync('[1,2]\n');
    expect((await post({ body: bad, headers: { Authorization: SECRET } })).status).toBe(400);
  });

  it('authenticates regardless of content type', async () => {
    const res = await post({ contentType: 'text/plain', headers: { Authorization: SECRET } });
    expect(res.status).toBe(200);
  });

  it('skips blank lines', () => {
    expect(parseTasks(Buffer.from('{"uid":1}\n\n{"uid":2}\r\n'), undefined)).toHaveLength(2);
  });

  it('never accepts when MEILISEARCH_AUTHORIZATION is unset', () => {
    expect(verifyMeilisearchRequest({ authorization: 'Bearer x' }, {})).toBe(false);
    expect(verifyMeilisearchRequest({ authorization: '' }, { MEILISEARCH_AUTHORIZATION: '' })).toBe(false);
  });
});
