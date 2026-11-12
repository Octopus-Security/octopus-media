/**
 * Security headers on every answer (HIPAA map, 2026-11-12 sweep; same set as octopus-kit
 * server/safeguards.js secureHeaders). The CSP restricts only framing, <base>, form targets and
 * plugins; it does NOT restrict script, style, img or connect, so Next's inline bootstrap scripts,
 * fonts and favicons from auth's /brand/ keep working. Next already serves dynamic pages with
 * no-store and fingerprinted assets as immutable, so no Cache-Control is added here.
 */
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=15552000; includeSubDomains' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
