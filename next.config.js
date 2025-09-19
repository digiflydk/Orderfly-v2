/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'placehold.co', pathname: '/**' },
      { protocol: 'https', hostname: 'i.postimg.cc', pathname: '/**' },
      { protocol: 'https', hostname: 'picsum.photos', pathname: '/**' },
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com', pathname: '/**' },
    ],
  },
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
  productionBrowserSourceMaps: false,
  output: 'standalone',
  webpack(config, { dev }) {
    if (dev) config.cache = false

    // Undgå "require.extensions is not supported by webpack" warnings fra handlebars/dotprompt
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      /require\.extensions is not supported by webpack/i,
      /Critical dependency: the request of a dependency is an expression/i,
    ];

    return config
  },
  async rewrites() {
    return {
      beforeFiles: [{ source: '/:path*', destination: '/:path*' }],
      afterFiles: [],
      fallback: [],
    }
  },
}
module.exports = nextConfig
