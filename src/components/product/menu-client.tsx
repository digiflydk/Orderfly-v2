
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Brand, Category, ComboMenu, Location, Product, StandardDiscount, TimeSlotResponse, ProductForMenu } from '@/types';
import { useCart } from '@/context/cart-context';
import { getActiveStandardDiscounts } from '@/app/superadmin/standard-discounts/actions';
import { getProductsByIds } from '@/app/superadmin/products/actions';
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
import { calculateTimeSlots } from '@/app/superadmin/locations/client-actions';


interface MenuClientProps {
    brand: Brand;
    location: Location;
    initialCategories: Category[];
    initialProducts: ProductForMenu[]; // All products passed from server
    initialActiveCombos: ComboMenu[];
    initialActiveStandardDiscounts: StandardDiscount[];
}

export function MenuClient({ brand, location, initialCategories, initialProducts, initialActiveCombos, initialActiveStandardDiscounts }: MenuClientProps) {
    const { setCartContext, deliveryType, itemCount, setSelectedTime } = useCart();
    const { trackEvent } = useAnalytics();
    const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});
    
    const [isLoading, setIsLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState<string>('offers');
    const [activeStandardDiscounts, setActiveStandardDiscounts] = useState<StandardDiscount[]>(initialActiveStandardDiscounts);
    const [comboProducts, setComboProducts] = useState<ProductForMenu[]>([]);
    const [showPreorderAlert, setShowPreorderAlert] = useState(false);


    useEffect(() => {
        setCartContext(brand, location);
        
        async function fetchInitialData() {
            setIsLoading(true);
            const fetchedTimeSlots = calculateTimeSlots(location);
            
             // Fetch products for combos if they exist
            if (initialActiveCombos.length > 0) {
                const comboProductIds = [...new Set(initialActiveCombos.flatMap(c => c.productGroups.flatMap(g => g.productIds)))];
                if (comboProductIds.length > 0) {
                    const fetchedComboProducts = await getProductsByIds(comboProductIds);
                    setComboProducts(fetchedComboProducts);
                }
            }

            // OF-424: Handle pre-order logic
            const isAsapAvailable = deliveryType === 'delivery' ? fetchedTimeSlots.asap_delivery : fetchedTimeSlots.asap_pickup;
            if (!isAsapAvailable && location.allowPreOrder && fetchedTimeSlots.nextAvailableDate) {
                setShowPreorderAlert(true);
                const nextAvailableTime = deliveryType === 'delivery' ? fetchedTimeSlots.asap_delivery : fetchedTimeSlots.asap_pickup;
                if(nextAvailableTime) {
                    setSelectedTime(nextAvailableTime);
                }
            } else {
                setShowPreorderAlert(false);
            }
            
            setIsLoading(false);
        }

        fetchInitialData();

        // Track view_menu event on initial load
        trackEvent('view_menu', { locationId: location.id, locationSlug: location.slug });

    }, [brand, location, setCartContext, initialActiveCombos, trackEvent, deliveryType, setSelectedTime]);

     useEffect(() => {
        // This hook re-fetches discounts on the client side to ensure they are up-to-date,
        // especially when the deliveryType changes.
        async function fetchDiscounts(type: 'delivery' | 'pickup') {
             const discounts = await getActiveStandardDiscounts({ brandId: brand.id, locationId: location.id, deliveryType: type });
             setActiveStandardDiscounts(discounts);
        }
        if (deliveryType) {
            fetchDiscounts(deliveryType);
        }
     }, [deliveryType, brand.id, location.id]);

     useEffect(() => {
        // OF-399: Show delivery modal only if a delivery method has not been previously selected in this session.
        // This ensures that on a direct land, the user is prompted to choose.
        if (typeof window !== 'undefined') {
            const savedDeliveryMethod = localStorage.getItem('deliveryMethod');
            if (!savedDeliveryMethod) {
                openDeliveryModal({ brandSlug: brand.slug, locationSlug: location.slug });
            }
        }
    }, [brand.slug, location.slug]);

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
        <div className="bg-[#FFF8F0]">
            <div className="container mx-auto max-w-[1140px] px-4">
                {showPreorderAlert && (
                    <Alert className="my-4">
                        <Info className="h-4 w-4" />
                        <AlertTitle>Location Closed</AlertTitle>
                        <AlertDescription>
                            This location is currently closed. You are placing a pre-order for the next available time.
                        </AlertDescription>
                    </Alert>
                )}
                <div className="lg:hidden py-4">
                   <TimeSelector />
                </div>
                
                 <div className="sticky top-16 z-30 bg-[#FFF8F0]/90 backdrop-blur-sm -mx-4 px-4 py-2 border-t border-b">
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
                            hasPromotionalDiscounts={hasPromotionalDiscounts}
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
        </div>
    );
}
