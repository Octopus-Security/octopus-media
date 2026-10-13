import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Octopus Media',
  description: 'Track your anime, movies, TV shows, and music.',
  // Brand pack favicon, served by octopus-auth (the pull model: auth hosts
  // the assets, this app holds only its slug). See
  // octopus-vault/FAVICON-PACK-SPEC.md §5. The manifest fetch must be
  // anonymous (uncredentialed) — auth serves /brand/* publicly with
  // Access-Control-Allow-Origin: *, which browsers refuse for a credentialed
  // request. Next's typed Metadata API has no crossorigin field for the
  // manifest <link>, but omitting it is correct here rather than a gap: a
  // manifest fetch's default credentials mode is already "omit"/anonymous,
  // the same thing the EJS/static apps spell out explicitly as
  // crossorigin="anonymous".
  icons: {
    icon: 'https://auth.octopustechnology.net/brand/media/favicon.svg',
    apple: 'https://auth.octopustechnology.net/brand/media/apple-touch-icon.png',
  },
  manifest: 'https://auth.octopustechnology.net/brand/media/site.webmanifest',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-text-body min-h-screen">
        <nav className="border-b border-border bg-surface px-6 py-3 flex items-center gap-3">
          <span className="text-accent font-bold text-lg tracking-tight">Octopus</span>
          <span className="text-text font-semibold text-lg">Media</span>
          <div className="ml-auto">
            <a href="/api/auth/logout" className="text-xs text-muted hover:text-text transition-colors">Sign out</a>
          </div>
        </nav>
        <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
