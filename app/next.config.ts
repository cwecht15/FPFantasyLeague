import type { NextConfig } from "next";

// When CANONICAL_HOST is set (e.g. "fpfl.example.com"), permanently redirect
// every other hostname — the old fpfl-fantasy.fly.dev included — to it. Unset
// locally and until the custom domain's cert is issued, so it is a no-op by
// default. /api/health is excluded so Fly's machine checks keep returning 200.
const canonicalHost = process.env.CANONICAL_HOST?.trim();

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    if (!canonicalHost) return [];
    return [
      {
        source: "/:path((?!api/health).*)",
        missing: [{ type: "host", value: canonicalHost }],
        destination: `https://${canonicalHost}/:path`,
        permanent: true,
      },
    ];
  },
  // pg and bcryptjs are server-only native-ish deps; keep them external so the
  // Next bundler doesn't try to bundle their dynamic requires.
  serverExternalPackages: ["pg", "bcryptjs", "nodemailer"],
};

export default nextConfig;
