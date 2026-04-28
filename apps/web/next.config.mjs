/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@shearsimp/shared"],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
