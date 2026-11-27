import type { NextConfig } from "next";

// Identifies this build; the page compares it with the server's to spot a newer deploy.
const BUILD_ID = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || `local-${Date.now()}`;

const nextConfig: NextConfig = {
  env: { BUILD_ID },
};

export default nextConfig;
