import type { NextConfig } from "next";

// Identifies this build; the page compares it with the server's to spot a newer deploy.
const BUILD_ID = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || `local-${Date.now()}`;

const dev = process.env.NODE_ENV !== "production";

/* Content-Security-Policy.
   - script-src 'unsafe-inline': Next.js emits inline bootstrap/flight scripts; a nonce would
     need proxy.ts to set one per request and force every page dynamic. Everything else is
     still locked to 'self', so injected <script src=...> from elsewhere is blocked.
     'unsafe-eval' only in dev (React's debugging needs it).
   - style-src 'unsafe-inline': React inline style={{}} attributes and next/font's inline @font-face.
   - fonts: next/font self-hosts Barlow Condensed and Inter at build time, so 'self' is enough.
   - blob:/data: in img/media: video export builds a Blob URL from canvas + MediaRecorder.
   - worker-src blob: for three.js / bundler workers. */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:" + (dev ? " ws: wss:" : ""),
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  env: { BUILD_ID },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
