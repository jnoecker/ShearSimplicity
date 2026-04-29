/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@shearsimp/shared"],
  // typedRoutes graduated out of `experimental` in Next 15.4.
  typedRoutes: true,
};

export default nextConfig;
