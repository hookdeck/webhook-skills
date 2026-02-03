export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Chargebee Webhooks - Next.js Example</h1>
      <p>This app receives Chargebee webhooks at:</p>
      <code style={{
        background: '#f4f4f4',
        padding: '0.5rem',
        borderRadius: '4px',
        display: 'inline-block'
      }}>
        POST /webhooks/chargebee
      </code>
      <h2>Setup Instructions</h2>
      <ol>
        <li>Configure your Chargebee webhook endpoint in the dashboard</li>
        <li>Enable Basic Authentication and set credentials</li>
        <li>Add the credentials to your .env.local file</li>
        <li>Select the events you want to receive</li>
      </ol>
    </main>
  );
}