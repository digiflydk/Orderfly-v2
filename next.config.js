let releaseSha = process.env.COMMIT_SHA || process.env.GITHUB_SHA || process.env.NEXT_PUBLIC_RELEASE_SHA || '';
if (!/^[a-f0-9]{7,40}$/.test(releaseSha)) {
  try { releaseSha = require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim(); }
  catch { releaseSha = 'unknown'; }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: {NEXT_PUBLIC_RELEASE_SHA: releaseSha},
  async headers() {
    return [
      { source: '/:brandSlug/:locationSlug/checkout/confirmation', headers: [
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      ] },
      { source: '/:brandSlug/checkout/confirmation', headers: [
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      ] },
    ];
  },
  experimental: {
    serverActions: { bodySizeLimit: '6mb' },
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
