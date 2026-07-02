export const metadata = {
  title: 'GoCardless Webhooks',
  description: 'GoCardless webhook handler example',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
