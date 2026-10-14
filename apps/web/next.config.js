/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Drawboard autosaves whole boards (images are inlined as data URLs) through
    // a server action. The 1 MB default would fail silently on image-heavy
    // boards; Vercel itself caps request bodies at 4.5 MB.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

module.exports = nextConfig;
