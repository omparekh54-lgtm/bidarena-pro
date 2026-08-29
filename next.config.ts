import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "media.api-sports.io", pathname: "/football/players/**" },
      { protocol: "https", hostname: "h.cricapi.com", pathname: "/img/players/**" },
    ],
  },
};

export default nextConfig;
