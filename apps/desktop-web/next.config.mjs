/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  transpilePackages: ["@repobrain/ui", "@repobrain/shared-types"]
};

export default nextConfig;
