

'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Gift, Pizza, Salad, CupSoda, Tag, Package, Search, ListFilter } from 'lucide-react';
import type { Brand, Category } from '@/types';
import { cn } from '@/lib/utils';
import { DynamicIcon } from '../superadmin/dynamic-icon';
import { ScrollArea, ScrollBar } from '../ui/scroll-area';

interface CategoryNavProps {
    categories: Category[];
    hasCombos: boolean;
    hasPromotionalDiscounts: boolean;
    brand: Brand;
    activeCategory: string;
}

const getIconForCategory = (category: Category) => {
    if (category.icon) {
        return <DynamicIcon name={category.icon} className="mr-2 h-4 w-4" />;
    }
    // Fallback icons
    const nameLower = category.categoryName.toLowerCase();
    if (nameLower.includes('offer')) return <Tag className="mr-2 h-4 w-4" />;
    if (nameLower.includes('pizza')) return <Pizza className="mr-2 h-4 w-4" />;
    if (nameLower.includes('salad')) return <Salad className="mr-2 h-4 w-4" />;
    if (nameLower.includes('drink') || nameLower.includes('soda')) return <CupSoda className="mr-2 h-4 w-4" />;
    return <Gift className="mr-2 h-4 w-4"/>;
}

const getIconForSpecialCategory = (type: 'offers' | 'combos') => {
    if (type === 'offers') return <Tag className="mr-2 h-4 w-4" />;
    if (type === 'combos') return <Package className="mr-2 h-4 w-4" />;
    return null;
}

export function CategoryNav({ categories, hasCombos, hasPromotionalDiscounts, brand, activeCategory }: CategoryNavProps) {
    const navRef = useRef<HTMLDivElement>(null);
    const activeRef = useRef<HTMLButtonElement>(null);
    
    useEffect(() => {
        if(activeRef.current && navRef.current) {
            activeRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'center'
            });
        }
    }, [activeCategory]);
    
    const handleCategoryClick = (categoryId: string) => {
        const element = document.getElementById(`category-${categoryId}`);
        if (element) {
            const yOffset = -100; // Adjust offset for sticky header
            const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
            window.scrollTo({ top: y, behavior: 'smooth' });
        }
    }
    
    const sortedCategories = useMemo(() => {
        return [...categories].sort((a,b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
    }, [categories]);

    const offersCategory = sortedCategories.find(c => c.id === 'offers');
    const regularCategories = sortedCategories.filter(c => c.id !== 'offers');

    return (
        <div className="flex items-center justify-between gap-4">
             <ScrollArea className="w-full whitespace-nowrap">
                <div ref={navRef} className="flex w-max space-x-2">
                    {hasPromotionalDiscounts && offersCategory && (
                        <Button
                            key={offersCategory.id}
                            variant={activeCategory === offersCategory.id ? 'brand' : 'outline'}
                            size="sm"
                            ref={activeCategory === offersCategory.id ? activeRef : null}
                            onClick={() => handleCategoryClick(offersCategory.id)}
                            className="h-9 shrink-0"
                        >
                            {getIconForSpecialCategory('offers')}
                            {offersCategory.categoryName}
                        </Button>
                    )}
                    {hasCombos && (
                        <Button
                            variant={activeCategory === 'combos' ? 'brand' : 'outline'}
                            size="sm"
                            ref={activeCategory === 'combos' ? activeRef : null}
                            onClick={() => handleCategoryClick('combos')}
                            className="h-9 shrink-0"
                        >
                            {getIconForSpecialCategory('combos')}
                            {brand.combosHeading || 'Combo Deals'}
                        </Button>
                    )}
                    {regularCategories.map(category => (
                        <Button 
                            key={category.id}
                            variant={activeCategory === category.id ? 'brand' : 'outline'}
                            size="sm"
                            ref={activeCategory === category.id ? activeRef : null}
                            onClick={() => handleCategoryClick(category.id)}
                            className="h-9 shrink-0"
                        >
                            {getIconForCategory(category)}
                            {category.categoryName}
                        </Button>
                    ))}
                </div>
                <ScrollBar orientation="horizontal" className="h-0" />
            </ScrollArea>

            <div className="relative hidden md:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search..." className="pl-10 h-9 w-40" />
            </div>
        </div>
    );
}
