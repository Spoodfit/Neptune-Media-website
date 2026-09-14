import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/hors-norme",
  assetPrefix: "/hors-norme",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
