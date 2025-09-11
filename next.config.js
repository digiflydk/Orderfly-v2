/** @type {import('next').NextConfig} */

const allowedDevOrigins =
  (process.env.ALLOWED_DEV_ORIGINS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    allowedDevOrigins,
    serverActions: { allowedOrigins: allowedDevOrigins }
  },
  serverExternalPackages: ['@opentelemetry/exporter-jaeger'],
  webpack: (config, { isServer, dev }) => {
    if (dev) {
      // undgå korrupt fil-cache i dev-miljøer
      config.cache = false;
    }
    if (!isServer) {
      // sørg for at handlebars ikke ender i klient-bundle
      config.externals = config.externals || [];
      config.externals.push({ handlebars: 'commonjs handlebars' });
    }
    return config;
  }
};

module.exports = nextConfig;
