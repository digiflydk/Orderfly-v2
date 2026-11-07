import { merchantInstallMetadata } from '@/lib/server/merchant-home-screen';
export const generateMetadata = merchantInstallMetadata;
export const dynamic = 'force-dynamic';
export default function LoginLayout({ children }: { children: React.ReactNode }) { return children; }
