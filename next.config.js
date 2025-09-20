/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: true,
  },
  images: {
    // Tillad eksterne billeder fra de domæner vi bruger i projektet
    remotePatterns: [
      { protocol: "https", hostname: "i.postimg.cc" },
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "res.cloudinary.com" },
      // Tilføj flere her hvis I ser tilsvarende fejl fra andre hosts
    ],
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
