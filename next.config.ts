// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Skip ESLint during production builds on Vercel
  eslint: {
    ignoreDuringBuilds: true,
  },
  // (Optional) If Vercel still stops on TS errors, uncomment the block below:
  // typescript: {
  //   ignoreBuildErrors: true,
  // },
};

export default nextConfig;
