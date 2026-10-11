import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* knowsys.vercel.app served a full second copy of the site. Canonical tags
     alone leave search engines to pick; a permanent redirect settles it and
     carries over links people already shared. Preview deployments have their
     own hostnames and are untouched. */
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "knowsys.vercel.app" }],
        destination: "https://knowsys.tech/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
