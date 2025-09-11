import { headers } from 'next/headers';

export function getOrigin() {
  const headersList = headers();
  const protocol = headersList.get('x-forwarded-proto') || 'http';
  const host = headersList.get('x-forwarded-host') || headersList.get('host');

  if (host) {
    return `${protocol}://${host}`;
  }
  
  // Fallback for environments where headers are not available (e.g., server-side scripts)
  const envUrl = process.env.SITE_URL;
  if (!envUrl) {
    // In a real production environment, you'd want to throw an error or have a reliable default.
    // For development, we can fallback to a local URL, but it's better to set the env var.
    console.warn('SITE_URL environment variable is not set. Falling back to localhost, which may not work in production.');
    return 'http://localhost:9002';
  }

  return envUrl.replace(/\/+$/, '');
}
