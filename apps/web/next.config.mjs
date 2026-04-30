/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@shearsimp/shared"],
  // typedRoutes graduated out of `experimental` in Next 15.4.
  typedRoutes: true,
  // Standalone output writes a self-contained server bundle to
  // .next/standalone, which the production Dockerfile copies into a slim
  // runtime image. Local `next dev` / `next start` are unaffected.
  output: "standalone",
};

export default nextConfig;
