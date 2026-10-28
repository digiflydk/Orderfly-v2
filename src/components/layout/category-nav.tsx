'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { Brand, Category } from '@/types';

interface CategoryNavProps {
  categories: Category[];
  hasCombos: boolean;
  hasPromotionalDiscounts: boolean;
  brand: Brand;
  activeCategory: string;
  search?: string;
  onSearchChange?: (value: string) => void;
}

export function CategoryNav({ categories, hasCombos, hasPromotionalDiscounts, brand, activeCategory, search = '', onSearchChange }: CategoryNavProps) {
  const navRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const [canScroll, setCanScroll] = useState({left: false, right: false});
  const items = useMemo(() => {
    const sorted = [...categories].sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
    return [
      ...sorted.filter(c => c.id === 'offers' && hasPromotionalDiscounts).map(c => ({id: c.id, name: c.categoryName})),
      ...(hasCombos ? [{id: 'combos', name: brand.combosHeading || 'Menuer'}] : []),
      ...sorted.filter(c => c.id !== 'offers').map(c => ({id: c.id, name: c.categoryName})),
    ];
  }, [categories, hasCombos, hasPromotionalDiscounts, brand.combosHeading]);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => setCanScroll({left: nav.scrollLeft > 1, right: nav.scrollWidth - nav.clientWidth - nav.scrollLeft > 1});
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    if (nav.firstElementChild) observer.observe(nav.firstElementChild);
    nav.addEventListener('scroll', measure, {passive: true});
    return () => { observer.disconnect(); nav.removeEventListener('scroll', measure); };
  }, [items]);
  const motion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' as const : 'smooth' as const;
  useEffect(() => {
    const nav = navRef.current, active = activeRef.current;
    if (!nav || !active) return;
    // Scroll only the category rail, never the document while customers browse.
    const box = active.getBoundingClientRect(), frame = nav.getBoundingClientRect();
    if (box.left < frame.left || box.right > frame.right) nav.scrollBy({left: box.left - frame.left - (frame.width - box.width) / 2, behavior: motion()});
  }, [activeCategory]);
  const selectCategory = (id: string) => {
    const target = document.getElementById(`category-${id}`);
    if (!target) return;
    const header = document.querySelector('[data-storefront-header]');
    const categories = navRef.current?.closest('[data-storefront-categories]');
    const offset = (header && getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().height : 0) + (categories?.getBoundingClientRect().height || 0) + 16;
    window.scrollTo({top: target.getBoundingClientRect().top + window.scrollY - offset, behavior: motion()});
  };
  return <div className="flex min-w-0 flex-col items-stretch gap-3 md:flex-row md:items-center">
    <nav aria-label="Menukategorier" className="flex min-w-0 flex-1 items-center gap-1">
      <Button type="button" variant="ghost" size="icon" aria-label="Vis tidligere kategorier" disabled={!canScroll.left} onClick={() => navRef.current?.scrollBy({left: -240, behavior: motion()})} className="h-11 w-9 shrink-0"><ChevronLeft className="h-4 w-4" /></Button>
      <div ref={navRef} className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-2 py-1 px-1">
          {items.map(item => <Button key={item.id} type="button" variant={activeCategory === item.id ? 'brand' : 'outline'} size="sm" aria-current={activeCategory === item.id ? 'true' : undefined} ref={activeCategory === item.id ? activeRef : null} onClick={() => selectCategory(item.id)} className="h-11 shrink-0">{item.name}</Button>)}
        </div>
      </div>
      <Button type="button" variant="ghost" size="icon" aria-label="Vis flere kategorier" disabled={!canScroll.right} onClick={() => navRef.current?.scrollBy({left: 240, behavior: motion()})} className="h-11 w-9 shrink-0"><ChevronRight className="h-4 w-4" /></Button>
    </nav>
    <div className="relative w-full shrink-0 md:w-56">
      <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input type="search" aria-label="Søg i menuen" value={search} onChange={event => onSearchChange?.(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') onSearchChange?.(''); }} placeholder="Søg i menuen…" className="pl-10 pr-11 h-11 w-full text-base [&::-webkit-search-cancel-button]:hidden" />
      {search && <button type="button" aria-label="Ryd menusøgning" onClick={() => onSearchChange?.('')} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center"><X className="h-4 w-4" /></button>}
    </div>
  </div>;
}
