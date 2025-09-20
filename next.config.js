/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: true,
  },
  webpack: (config) => {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      /require\.extensions is not supported by webpack/i,
      /Critical dependency: the request of a dependency is an expression/i,
    ];
    return config;
  },
};
module.exports = nextConfig;
