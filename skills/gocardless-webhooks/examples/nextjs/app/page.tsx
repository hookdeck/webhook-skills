export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>GoCardless Webhooks</h1>
      <p>
        This example receives GoCardless webhooks at{' '}
        <code>POST /webhooks/gocardless</code>.
      </p>
    </main>
  );
}
