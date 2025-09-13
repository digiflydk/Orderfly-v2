/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'placehold.co', pathname: '/**' },
      { protocol: 'https', hostname: 'i.postimg.cc', pathname: '/**' },
      { protocol: 'https', hostname: 'picsum.photos', pathname: '/**' },
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com', pathname: '/**' },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  productionBrowserSourceMaps: false,
  output: 'standalone',
  webpack(config, { dev }) {
    if (dev) {
      // Mindsk diskbrug i Studio (dev-preview)
      config.cache = false
    }
    return config
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/api/:path*', destination: '/api/:path*' },
      ],
      afterFiles: [],
      fallback: [],
    }
  },
}
module.exports = nextConfig
