import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  assetPrefix: "/neptune-jt-assets",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
