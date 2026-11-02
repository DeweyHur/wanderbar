import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@wanderbar/route"],
  // Private app: keep every page and API response out of search engines.
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
  // The Expo web app is exported into public/ (see the "build:web" script). Anything that isn't an
  // API route or a static file falls back to its single HTML page, where Expo Router takes over
  // (e.g. /invite/<token>, /group/<id>).
  async rewrites() {
    return { beforeFiles: [], afterFiles: [], fallback: [{ source: "/:path*", destination: "/index.html" }] };
  },
};

export default config;
