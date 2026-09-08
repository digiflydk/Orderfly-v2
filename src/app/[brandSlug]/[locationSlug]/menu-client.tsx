'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Brand,
  Category,
  ComboMenu,
  Location,
  StandardDiscount,
  ProductForMenu,
  TimeSlotResponse,
} from '@/types';
import { useCart } from '@/context/cart-context';
import { comboEligible, comboProductsAvailable } from '@/lib/combo-eligibility';
import { searchMenu, type DisplayProduct } from '@/lib/menu-display';
import { DesktopCart } from '@/components/cart/desktop-cart';
import { CategoryNav } from '@/components/layout/category-nav';
import { MobileFloatingCart } from '@/components/cart/mobile-floating-cart';
import { OffersSection } from '@/components/product/offers-section';
import { ComboSection } from '@/components/product/combo-section';
import { CategorySection } from '@/components/product/category-section';
import { TimeSelector } from '@/components/checkout/time-selector';
import { Skeleton } from '@/components/ui/skeleton';
import { useAnalytics } from '@/context/analytics-context';
import { openDeliveryModal } from '@/components/modals/DeliveryMethodModal';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import { calculateTimeSlots } from '@/lib/time-slots';

interface MenuClientProps {
  initialDeliveryType?: 'pickup' | 'delivery';
  brand: Brand;
  location: Location;
  initialCategories: Category[];
  initialProducts: DisplayProduct[]; // All products passed from server
  initialActiveCombos: ComboMenu[];
  initialActiveStandardDiscounts: StandardDiscount[];
}

export function MenuClient({
  initialDeliveryType = 'pickup',
  brand,
  location,
  initialCategories,
  initialProducts,
  initialActiveCombos,
  initialActiveStandardDiscounts,
}: MenuClientProps) {
  const { setCartContext, deliveryType, itemCount, standardDiscounts, cartReady } = useCart();
  const { trackEvent } = useAnalytics();
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [activeCategory, setActiveCategory] = useState<string>('offers');
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(() => new Date());
  const activeStandardDiscounts = cartReady ? standardDiscounts : deliveryType === initialDeliveryType || !deliveryType ? initialActiveStandardDiscounts : [];
  const mode = deliveryType || initialDeliveryType;
  const activeCombos = useMemo(() => initialActiveCombos.filter(combo =>
    comboProductsAvailable(combo, initialProducts) &&
    comboEligible(combo, {brandId: brand.id, locationId: location.id, deliveryType: mode, now})
  ), [initialActiveCombos, initialProducts, brand.id, location.id, mode, now]);
  const visibleProducts = useMemo(() => searchMenu(initialProducts, search), [initialProducts, search]);
  const visibleCombos = useMemo(() => searchMenu(activeCombos, search), [activeCombos, search]);
  const visibleCategories = initialCategories.filter(c => c.id === 'offers' || visibleProducts.some(p => (p.displayCategoryId || p.categoryId) === c.id));
  const timeSlots = useMemo(() => calculateTimeSlots(location, undefined, now), [location, now]);

  useEffect(() => {
    setCartContext(brand, location, {deliveryType: initialDeliveryType, discounts: initialActiveStandardDiscounts});
  }, [brand, location, setCartContext, initialDeliveryType, initialActiveStandardDiscounts]);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, 30000);
    window.addEventListener('focus', tick);
    return () => { clearInterval(timer); window.removeEventListener('focus', tick); };
  }, []);
  const trackedMenu = useRef('');
  useEffect(() => {
    const key = `${brand.id}/${location.id}`;
    if (trackedMenu.current === key) return;
    if (trackEvent('view_menu', {locationId: location.id})) trackedMenu.current = key;
  }, [brand.id, location.id, trackEvent]);

  useEffect(() => {
    // OF-399: Show delivery modal only if a delivery method has not been previously selected in this session.
    if (typeof window !== 'undefined') {
      const requestedDeliveryMethod = new URLSearchParams(window.location.search).get('deliveryMethod');
      let savedDeliveryMethod: string | null = null;
      try {
        savedDeliveryMethod = localStorage.getItem('deliveryMethod');
      } catch {
        // The query parameter can still provide a valid selection.
      }
      const hasRequestedDeliveryMethod =
        requestedDeliveryMethod === 'delivery' || requestedDeliveryMethod === 'pickup' || requestedDeliveryMethod === 'takeaway';
      if (!hasRequestedDeliveryMethod && !savedDeliveryMethod) {
        openDeliveryModal({ brandSlug: brand.slug, locationSlug: location.slug, location });
      }
    }
  }, [brand.slug, location.slug]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const categoryId = entry.target.id.replace('category-', '');
            setActiveCategory(categoryId);
          }
        });
      },
      { rootMargin: '-100px 0px -50% 0px', threshold: 0 },
    );

    const currentRefs = categoryRefs.current;
    Object.values(currentRefs).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => {
      Object.values(currentRefs).forEach((el) => {
        if (el) observer.unobserve(el);
      });
    };
  }, [initialCategories, visibleCombos.length, search]);

  const hasPromotionalDiscounts = activeStandardDiscounts.some(
    (d) => d.assignToOfferCategory,
  );

  return (
    <div data-commerce-root className="bg-[#FFF8F0]">
      <div className="container mx-auto max-w-[1140px] px-4">
        <div className="py-4">
          <TimeSelector timeSlots={timeSlots} />
        </div>

        <div className="sticky top-16 z-30 bg-[#FFF8F0]/90 backdrop-blur-sm -mx-4 px-4 py-2 border-t border-b">
          <CategoryNav categories={visibleCategories} hasCombos={visibleCombos.length > 0}
            hasPromotionalDiscounts={hasPromotionalDiscounts} brand={brand} activeCategory={activeCategory}
            search={search} onSearchChange={setSearch} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 lg:gap-6">
          <div className="lg:col-span-2">
            <div className="space-y-12 py-6">
              {!visibleProducts.length && !visibleCombos.length && <p role="status">Ingen varer matcher søgningen.</p>}
              {hasPromotionalDiscounts && (
                <OffersSection
                  brand={brand}
                  location={location}
                  activeDiscounts={activeStandardDiscounts}
                  allProducts={visibleProducts}
                  categoryRef={(el) => (categoryRefs.current['offers'] = el)}
                />
              )}

              {visibleCombos.length > 0 && (
                <ComboSection
                  brand={brand}
                  location={location}
                  combos={visibleCombos}
                  comboProducts={initialProducts}
                  categoryRef={(el) => (categoryRefs.current['combos'] = el)}
                />
              )}

              {visibleCategories
                .filter((c) => c.id !== 'offers')
                .map((category) => (
                  <CategorySection
                    key={`cat-section-${category.id}`}
                    brandId={brand.id}
                    locationId={location.id}
                    category={category}
                    products={visibleProducts.filter(
                      (p) => (p.displayCategoryId || p.categoryId) === category.id,
                    )}
                    activeDiscounts={activeStandardDiscounts}
                    categoryRef={(el) =>
                      (categoryRefs.current[category.id] = el)
                    }
                  />
                ))}
            </div>
          </div>

          <div className="hidden lg:block lg:col-span-1 py-6">
            <div className="sticky top-32 h-auto">
              <DesktopCart />
            </div>
          </div>
        </div>
      </div>

      {itemCount > 0 && <MobileFloatingCart />}
    </div>
  );
}
