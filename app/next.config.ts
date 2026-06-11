import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // pg and bcryptjs are server-only native-ish deps; keep them external so the
  // Next bundler doesn't try to bundle their dynamic requires.
  serverExternalPackages: ["pg", "bcryptjs"],
};

export default nextConfig;
