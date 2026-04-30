import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @neplex/vectorizer is a NAPI-RS native addon (.node binary).
  // Webpack cannot bundle native modules — mark it external so Node resolves it at runtime.
  serverExternalPackages: ["@neplex/vectorizer"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "github.githubassets.com",
      },
    ],
  },
};

export default nextConfig;
