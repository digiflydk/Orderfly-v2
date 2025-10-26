
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {},
  },
  images: {
    domains: [
      'firebasestorage.googleapis.com',
      'placehold.co',
      'i.postimg.cc',
      'picsum.photos',
      'images.unsplash.com',
      'res.cloudinary.com',
    ],
    remotePatterns: [
      { protocol: "https", hostname: "i.postimg.cc" },
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "placehold.co" },
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
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
