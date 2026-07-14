/** @type {import('next').NextConfig} */
const nextConfig = {
  // Linting is handled by Biome at the repo root, not ESLint.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
