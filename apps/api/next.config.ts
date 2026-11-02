import type { NextConfig } from "next";

const config: NextConfig = {
  // Private app: keep every page and API response out of search engines.
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};

export default config;
