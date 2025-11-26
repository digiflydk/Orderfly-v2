
'use client';
import { useMemo, useState } from 'react';
import type { GeneralSettings } from '@/types/settings';
import type { BrandWebsiteConfig, WebsiteHeaderConfig } from '@/lib/types/brandWebsite';
import { Header } from './Header';
import M3Footer from '@/components/layout/M3Footer';
import StickyOrderChoice from '@/app/m3/_components/StickyOrderChoice';
import { OrderModal } from '@/app/m3/_components/OrderModal';
import { useRouter } from 'next/navigation';

function toHsla({ h, s, l, opacity }: { h: number; s: number; l: number; opacity: number }) {
    const a = Math.max(0, Math.min(1, opacity / 100));
    return `hsla(${h} ${s}% ${l}% / ${a})`;
}

interface Template1PageProps {
  config: BrandWebsiteConfig;
  headerProps: WebsiteHeaderConfig;
  children: React.ReactNode;
}

export function Template1Page({ config, headerProps, children }: Template1PageProps) {
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const router = useRouter();

  const handleDeliveryMethodSelected = (method: 'takeaway' | 'delivery') => {
    // In a real scenario, this would likely update cart context and then navigate
    console.log(`Selected delivery method: ${method}`);
    const orderHref = config.defaultLocationId ? `/m3pizza/${config.defaultLocationId}` : '/m3pizza';
    router.push(orderHref);
  };
  
  const handleOrderClick = () => {
      setOrderModalOpen(true);
  }

  const themeVars = useMemo(() => {
    const ds = config.designSystem;
    const vars: React.CSSProperties = {};

    if (ds?.colors) {
      vars['--color-primary'] = ds.colors.primary;
      vars['--color-secondary'] = ds.colors.secondary;
      vars['--color-background'] = ds.colors.background;
      vars['--color-foreground'] = ds.colors.textPrimary;
      vars['--color-muted-foreground'] = ds.colors.textSecondary;
    }
    if (ds?.buttons?.primaryVariant) {
      vars['--color-m3-button'] = ds.buttons.primaryVariant.background;
      vars['--color-m3-button-hover'] = ds.buttons.secondaryVariant.background;
    }
     if (ds?.typography) {
      vars['--font-heading'] = ds.typography.headingFont;
      vars['--font-body'] = ds.typography.bodyFont;
    }

    return vars;
  }, [config.designSystem]);

  return (
    <div style={themeVars}>
      <Header {...headerProps} onOrderClick={handleOrderClick} />
      <main>{children}</main>
      <M3Footer />
      <div data-testid="template1-sticky-cta">
        <StickyOrderChoice onOrderClick={handleOrderClick} />
      </div>
      <OrderModal
        open={orderModalOpen}
        onOpenChange={setOrderModalOpen}
        onDeliveryMethodSelected={handleDeliveryMethodSelected}
      />
    </div>
  );
}
