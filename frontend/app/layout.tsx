import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Octopus Media',
  description: 'Track your anime, movies, TV shows, and music.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-text-body min-h-screen">
        <nav className="border-b border-border bg-surface px-6 py-3 flex items-center gap-3">
          <span className="text-accent font-bold text-lg tracking-tight">Octopus</span>
          <span className="text-text font-semibold text-lg">Media</span>
        </nav>
        <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
