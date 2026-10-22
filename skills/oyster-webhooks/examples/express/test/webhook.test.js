const request = require('supertest');

const AUTH = 'Bearer s3cr3t-shared-secret-12345';
process.env.OYSTER_AUTHORIZATION = AUTH;

const app = require('../src/index');
const { verifyOysterRequest } = require('../src/index');

// Envelope and data keys follow Oyster's documented webhook events
function makeEvent(eventName, data) {
  return {
    eventName,
    eventTimestamp: '2026-04-21T09:35:13Z',
    id: 'wh_01J19XRFZ2Q4QBDC6CA461AGT7',
    companyId: 'ABC1234',
    data,
  };
}

const events = {
  engaged: makeEvent('hiring.employment_engaged', { engagementId: 'eng_1' }),
  approved: makeEvent('expenses.expense_approved', {
    expenseId: 'exp_1',
    reviewState: 'approved',
    previousReviewState: 'pending',
  }),
  applied: makeEvent('contract.change_applied', {
    engagementChangeId: 'chg_1',
    changeType: 'salary',
    state: 'applied',
  }),
  enrolled: makeEvent('benefits.enrollment_enrolled', { engagementId: 'eng_1', enrollmentId: 'enr_1' }),
};

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/oyster')
    .set('Content-Type', contentType)
    .set(headers)
    .send(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('Oyster webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts the full Authorization header value', async () => {
    const res = await post(events.engaged, { Authorization: AUTH });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    const res = await post(events.engaged);
    expect(res.status).toBe(401);
  });

  it('rejects a wrong secret', async () => {
    const res = await post(events.engaged, { Authorization: 'Bearer wrong-secret' });
    expect(res.status).toBe(401);
  });

  it('rejects the secret without the "Bearer " prefix', async () => {
    const res = await post(events.engaged, { Authorization: AUTH.replace('Bearer ', '') });
    expect(res.status).toBe(401);
  });

  it('rejects a header of a different length without throwing', async () => {
    const res = await post(events.engaged, { Authorization: 'Bearer x' });
    expect(res.status).toBe(401);
  });

  it('rejects a non-ASCII header value without throwing', async () => {
    const res = await post(events.engaged, { Authorization: Buffer.from('Bearer sécret', 'utf8').toString('latin1') });
    expect(res.status).toBe(401);
  });

  it('rejects everything when OYSTER_AUTHORIZATION is unset', () => {
    expect(verifyOysterRequest({ authorization: AUTH }, {})).toBe(false);
    expect(verifyOysterRequest({ authorization: '' }, { OYSTER_AUTHORIZATION: '' })).toBe(false);
  });

  it('authenticates before parsing, so a bad credential with bad JSON is 401', async () => {
    const res = await post('not json', { Authorization: 'Bearer nope' });
    expect(res.status).toBe(401);
  });

  it.each(Object.entries(events))('handles %s', async (_name, event) => {
    const res = await post(event, { Authorization: AUTH });
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalled();
  });

  it('logs details for expenses.expense_approved', async () => {
    await post(events.approved, { Authorization: AUTH });
    expect(console.log).toHaveBeenCalledWith('Expense exp_1 approved (pending -> approved)');
  });

  it('returns 200 for events it does not handle', async () => {
    const res = await post(makeEvent('time_off.request_created', {}), { Authorization: AUTH });
    expect(res.status).toBe(200);
  });

  it('accepts any content type', async () => {
    const res = await post(events.applied, { Authorization: AUTH }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await post('not json', { Authorization: AUTH });
    expect(res.status).toBe(400);
  });

  it('returns 400 when eventName is missing', async () => {
    const res = await post({ id: 'wh_1', data: {} }, { Authorization: AUTH });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    const res = await post('[]', { Authorization: AUTH });
    expect(res.status).toBe(400);
  });
});
