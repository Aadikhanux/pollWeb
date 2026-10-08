import './globals.css';

export const metadata = {
  title: 'KeySentry | SOC Dashboard',
  description: 'Real-time API Key & Secret Leakage Monitor',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-soc-bg text-soc-text font-sans min-h-screen antialiased selection:bg-soc-accent/30">
        {children}
      </body>
    </html>
  );
}
