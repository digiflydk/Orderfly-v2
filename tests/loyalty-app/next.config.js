const path = require('node:path');
const root = path.resolve(__dirname, '../..');
module.exports = {
  experimental: { externalDir: true },
  webpack(config) {
    const fixtures = path.join(__dirname, 'fixtures');
    for (const [module, file] of Object.entries({
      '@/lib/firebase-admin': 'admin.ts', '@/lib/firebase': 'firebase.ts',
      '@/context/cart-context': 'cart.tsx', '@/context/analytics-context': 'analytics.ts',
      '@/app/superadmin/brands/actions': 'brands.ts', '@/app/superadmin/locations/actions': 'locations.ts',
      '@/app/superadmin/upsells/actions': 'upsells.ts', '@/app/superadmin/settings/actions': 'settings.ts',
      '@/app/superadmin/locations/client-actions': 'times.ts',
      '@/lib/payments/settings': 'keys.ts', '@stripe/stripe-js': 'stripe-client.ts',
      '@stripe/react-stripe-js': 'elements.tsx', 'stripe': 'stripe.ts',
    })) {
      const target = path.join(fixtures, file);
      config.resolve.alias[module + '$'] = target;
      if (module.startsWith('@/')) {
        const source = path.join(root, 'src', module.slice(2));
        config.resolve.alias[source + '$'] = target;
        config.resolve.alias[source + '.ts$'] = target;
        config.resolve.alias[source + '.tsx$'] = target;
      }
    }
    config.resolve.alias['@'] = path.join(root, 'src');
    return config;
  },
};
