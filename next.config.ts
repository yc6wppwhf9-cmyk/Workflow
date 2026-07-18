import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. A stray package-lock.json in a parent
  // directory made Turbopack infer the root as C:\Users\<user>\Documents, so its
  // PostCSS/Tailwind worker resolved from the wrong place and timed out compiling
  // globals.css ("timed out waiting for the Node.js process to connect").
  turbopack: {
    root: path.resolve(process.cwd()),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
};

export default nextConfig;
