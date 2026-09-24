/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // The FormSG SDK is Node-only; keep it external to the server bundle.
    serverComponentsExternalPackages: ["@opengovsg/formsg-sdk"],
    // Import batches (200 rows) can exceed the 1 MB default.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

module.exports = nextConfig;
