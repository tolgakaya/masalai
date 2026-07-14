/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server for the Railway image (railway-deployment.md §3.1).
  output: 'standalone',
  // Linting is handled by Biome at the repo root, not ESLint.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
