

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Brand, Category, ComboMenu, Location, Product, StandardDiscount, TimeSlotResponse, ProductForMenu } from '@/types';
import { useCart } from '@/context/cart-context';
import { getActiveStandardDiscounts } from '@/app/superadmin/standard-discounts/actions';
import { getActiveCombosForLocation } from '@/app/superadmin/combos/actions';
import { DeliveryMethodDialog } from '@/components/checkout/delivery-method-dialog';
import { DesktopCart } from '@/components/cart/desktop-cart';
import { CategoryNav } from '@/components/layout/category-nav';
import { MobileFloatingCart } from '@/components/cart/mobile-floating-cart';
import { OffersSection } from '@/components/product/offers-section';
import { ComboSection } from '@/components/product/combo-section';
import { CategorySection } from '@/components/product/category-section';
import { getTimeSlots } from '@/app/superadmin/locations/actions';
import { TimeSelector } from '@/components/checkout/time-selector';
import { getProductsByIds } from '@/app/superadmin/products/actions';
import { Skeleton } from '@/components/ui/skeleton';
import { useAnalytics } from '@/context/analytics-context';

interface MenuClientProps {
    brand: Brand;
    location: Location;
    initialCategories: Category[];
    initialProducts: ProductForMenu[]; // All products passed from server
    initialActiveCombos: ComboMenu[];
    initialActiveStandardDiscounts: StandardDiscount[];
}

export function MenuClient({ brand, location, initialCategories, initialProducts, initialActiveCombos, initialActiveStandardDiscounts }: MenuClientProps) {
    const { setCartContext, deliveryType, itemCount } = useCart();
    const { trackEvent } = useAnalytics();
    const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});
    
    const [isLoading, setIsLoading] = useState(true);
    const [isDeliveryDialogOpen, setIsDeliveryDialogOpen] = useState(false);
    const [activeCategory, setActiveCategory] = useState<string>('offers');
    const [timeSlots, setTimeSlots] = useState<TimeSlotResponse | null>(null);
    const [activeStandardDiscounts, setActiveStandardDiscounts] = useState<StandardDiscount[]>(initialActiveStandardDiscounts);
    const [comboProducts, setComboProducts] = useState<ProductForMenu[]>([]);

    useEffect(() => {
        setCartContext(brand, location);
        
        async function fetchInitialData() {
            setIsLoading(true);
            const fetchedTimeSlots = await getTimeSlots(location.id);
            setTimeSlots(fetchedTimeSlots);
            
             // Fetch products for combos if they exist
            if (initialActiveCombos.length > 0) {
                const comboProductIds = [...new Set(initialActiveCombos.flatMap(c => c.productGroups.flatMap(g => g.productIds)))];
                if (comboProductIds.length > 0) {
                    const fetchedComboProducts = await getProductsByIds(comboProductIds);
                    setComboProducts(fetchedComboProducts);
                }
            }
            setIsLoading(false);
        }

        fetchInitialData();

        // Track view_menu event on initial load
        trackEvent('view_menu', { locationId: location.id, locationSlug: location.slug });

    }, [brand, location, setCartContext, initialActiveCombos, trackEvent]);

     useEffect(() => {
        // This hook re-fetches discounts on the client side to ensure they are up-to-date,
        // especially when the deliveryType changes.
        async function fetchDiscounts() {
             const discounts = await getActiveStandardDiscounts({ brandId: brand.id, locationId: location.id, deliveryType });
             setActiveStandardDiscounts(discounts);
        }
        fetchDiscounts();
     }, [deliveryType, brand.id, location.id]);

     useEffect(() => {
        // Show dialog only if a delivery method has not been previously selected in this session.
        if (typeof window !== 'undefined') {
            const savedDeliveryMethod = localStorage.getItem('deliveryMethod');
            if (!savedDeliveryMethod) {
                setIsDeliveryDialogOpen(true);
            }
        }
    }, []);

    useEffect(() => {
        if (isLoading) return; // Don't run observer until everything is loaded
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                       const categoryId = entry.target.id.replace('category-', '');
                       setActiveCategory(categoryId);
                    }
                });
            },
            { rootMargin: '-100px 0px -50% 0px', threshold: 0 }
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
    }, [initialCategories, initialActiveCombos.length, isLoading]);
    
    const hasPromotionalDiscounts = activeStandardDiscounts.some(d => d.assignToOfferCategory);

    return (
        <>
            <DeliveryMethodDialog isOpen={isDeliveryDialogOpen} setIsOpen={setIsDeliveryDialogOpen} />

            <div className="container mx-auto max-w-[1140px] px-4">
                <div className="lg:hidden pb-4">
                   <TimeSelector timeSlots={timeSlots} />
                </div>
                
                 <div className="sticky top-16 z-30 bg-background/90 backdrop-blur-sm -mx-4 px-4 py-2 border-t border-b">
                    {isLoading ? (
                        <div className="flex items-center gap-2 h-9">
                            <Skeleton className="h-full w-24 rounded-md" />
                            <Skeleton className="h-full w-28 rounded-md" />
                            <Skeleton className="h-full w-20 rounded-md" />
                        </div>
                    ) : (
                       <CategoryNav 
                            categories={initialCategories} 
                            hasCombos={initialActiveCombos.length > 0} 
                            brand={brand}
                            activeCategory={activeCategory}
                        />
                    )}
                 </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 lg:gap-6">
                    <div className="lg:col-span-2">
                        <div className="space-y-12 py-6">
                            {hasPromotionalDiscounts && (
                                <OffersSection 
                                    brand={brand}
                                    location={location}
                                    activeDiscounts={activeStandardDiscounts}
                                    allProducts={initialProducts}
                                    categoryRef={el => (categoryRefs.current['offers'] = el)}
                                />
                            )}
                            {initialActiveCombos.length > 0 && (
                                <ComboSection 
                                    brand={brand}
                                    location={location}
                                    combos={initialActiveCombos}
                                    comboProducts={comboProducts}
                                    categoryRef={el => (categoryRefs.current['combos'] = el)}
                                />
                            )}
                            {initialCategories.filter(c => c.id !== 'offers').map(category => (
                                 <CategorySection
                                    key={`cat-section-${category.id}`}
                                    brandId={brand.id}
                                    locationId={location.id}
                                    category={category}
                                    products={initialProducts.filter(p => p.categoryId === category.id)}
                                    activeDiscounts={activeStandardDiscounts}
                                    categoryRef={el => (categoryRefs.current[category.id] = el)}
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
        </>
    );
}
