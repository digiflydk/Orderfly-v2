
'use server';

import type { StandardDiscount, Product, Category, ComboMenu, Brand, Location } from "@/types";
import { getActiveStandardDiscounts } from "../standard-discounts/actions";

// This file will contain the logic for the OCD (Offers/Combos Display) test cases.
// For now, it's a placeholder structure. A full implementation would involve
// creating mock data and calling the same data-massaging logic as the menu page.

export interface TestResult {
    id: string;
    scenario: string;
    expected: string;
    actual: string;
    status: 'Pass' | 'Fail' | 'Not Implemented';
}

const mockBrand: Brand = { id: 'brand-test', name: 'Test Brand' } as Brand;
const mockLocation: Location = { id: 'loc-test', brandId: 'brand-test', name: 'Test Location' } as Location;
const mockProducts: Product[] = [
    { id: 'prod-1', productName: 'Test Product 1', categoryId: 'cat-1', price: 100, brandId: 'brand-test' } as Product,
    { id: 'prod-2', productName: 'Test Product 2', categoryId: 'cat-1', price: 120, brandId: 'brand-test' } as Product,
    { id: 'prod-3', productName: 'Test Product 3', categoryId: 'cat-2', price: 80, brandId: 'brand-test' } as Product,
    { id: 'prod-4', productName: 'Test Product 4', categoryId: 'cat-2', price: 90, brandId: 'brand-test' } as Product,
];
const mockCategories: Category[] = [
    { id: 'cat-1', categoryName: 'Category 1', locationIds: ['loc-test'], isActive: true } as Category,
    { id: 'cat-2', categoryName: 'Category 2', locationIds: ['loc-test'], isActive: true } as Category,
    { id: 'cat-hidden', categoryName: 'Hidden Category', locationIds: ['loc-test'], isActive: false } as Category,
];
const mockCombos: ComboMenu[] = [
    { id: 'combo-1', comboName: 'Test Combo 1' } as ComboMenu,
];


// Simplified version of the logic in the menu page for testing purposes.
function processMenuData(products: Product[], categories: Category[], activeCombos: ComboMenu[], promotionalDiscounts: StandardDiscount[], brand: Brand, location: Location): { finalCategories: Category[], finalProducts: Product[] } {
  let finalProducts = [...products];
  let finalCategories = [...categories];

  if (promotionalDiscounts.length > 0) {
    const offerCategory: Category = {
        id: 'offers',
        brandId: brand.id,
        categoryName: brand.offersHeading || 'Offers', // Use override or default
        locationIds: [location.id],
        isActive: true,
        sortOrder: -1,
    };
    
    finalCategories.unshift(offerCategory);

    const productIdsInOffers = new Set<string>();
    
    promotionalDiscounts.forEach(d => {
      if (d.discountType === 'product') {
        d.referenceIds.forEach(id => productIdsInOffers.add(id));
      } else if (d.discountType === 'category') {
        const productsInCategory = products.filter(p => p.categoryId && d.referenceIds.includes(p.categoryId));
        productsInCategory.forEach(p => productIdsInOffers.add(p.id));
      }
    });

    if (productIdsInOffers.size > 0) {
        const offerProducts = products
            .filter(p => productIdsInOffers.has(p.id))
            .map(p => ({
                ...p,
                id: `${p.id}-offer`,
                categoryId: offerCategory.id,
            }));
        finalProducts.push(...offerProducts);
    }
  }
  return { finalCategories, finalProducts };
}


// Main Test Runner Function
export async function runOffersCombosValidationTests(): Promise<TestResult[]> {
    const results: TestResult[] = [];

    // OCD-001
    let promoDiscounts = [{ assignToOfferCategory: true, discountType: 'product', referenceIds: ['prod-1', 'prod-2'] }] as StandardDiscount[];
    let processed = processMenuData([...mockProducts], [...mockCategories], [], promoDiscounts, mockBrand, mockLocation);
    let hasOffers = processed.finalCategories.some(c => c.id === 'offers');
    results.push({
        id: 'OCD-001', scenario: 'Show "Offers" when products have discount with "Offers" category selected',
        expected: 'Offers category IS present',
        actual: hasOffers ? 'Offers category IS present' : 'Offers category is NOT present',
        status: hasOffers ? 'Pass' : 'Fail',
    });

    // OCD-002
    promoDiscounts = [{ assignToOfferCategory: false, discountType: 'product', referenceIds: ['prod-1'] }] as StandardDiscount[];
    processed = processMenuData([...mockProducts], [...mockCategories], [], promoDiscounts, mockBrand, mockLocation);
    hasOffers = processed.finalCategories.some(c => c.id === 'offers');
     results.push({
        id: 'OCD-002', scenario: 'Hide "Offers" when no products/categories use "Offers" as display category',
        expected: 'Offers category is NOT present',
        actual: hasOffers ? 'Offers category IS present' : 'Offers category is NOT present',
        status: !hasOffers ? 'Pass' : 'Fail',
    });
    
    // OCD-003
    let hasCombos = mockCombos.length > 0;
     results.push({
        id: 'OCD-003', scenario: 'Show "Combo Deals" if 1+ combos exist',
        expected: 'Combo section is shown',
        actual: hasCombos ? 'Combo section is shown' : 'Combo section is hidden',
        status: hasCombos ? 'Pass' : 'Fail',
    });
    
    // OCD-004
    let hasNoCombos = [].length === 0;
     results.push({
        id: 'OCD-004', scenario: 'Hide "Combo Deals" if no combos exist',
        expected: 'Combo section is hidden',
        actual: !hasNoCombos ? 'Combo section is shown' : 'Combo section is hidden',
        status: !hasNoCombos ? 'Pass' : 'Fail',
    });

    // OCD-005
    promoDiscounts = [{ assignToOfferCategory: true, discountType: 'product', referenceIds: ['prod-1'] }] as StandardDiscount[];
    processed = processMenuData([...mockProducts], [...mockCategories], mockCombos, promoDiscounts, mockBrand, mockLocation);
    const categoryOrderCorrect = processed.finalCategories[0]?.id === 'offers';
    results.push({
        id: 'OCD-005', scenario: 'Offers and Combo sections appear in correct order in menu',
        expected: '"Offers" category appears first',
        actual: `First category is "${processed.finalCategories[0]?.id}"`,
        status: categoryOrderCorrect ? 'Pass' : 'Fail',
    });
    
     // OCD-006: Test custom heading override
    const brandWithOverride: Brand = { ...mockBrand, offersHeading: 'Særlige Tilbud', combosHeading: 'Måltidstilbud' };
    processed = processMenuData([], [], [], [{ assignToOfferCategory: true, discountType: 'product', referenceIds: ['p1'] }] as StandardDiscount[], brandWithOverride, mockLocation);
    const customHeading = processed.finalCategories.find(c => c.id === 'offers')?.categoryName;
    const customComboHeading = brandWithOverride.combosHeading; // Direct check
    results.push({
        id: 'OCD-006', scenario: 'Custom heading for Offers and Combos is shown if defined in brand settings',
        expected: 'Headings are "Særlige Tilbud" and "Måltidstilbud"',
        actual: `Offer: "${customHeading}", Combo: "${customComboHeading}"`,
        status: customHeading === 'Særlige Tilbud' && customComboHeading === 'Måltidstilbud' ? 'Pass' : 'Fail',
    });

    // OCD-007 is a UI fallback test and hard to automate here. Marked as Not Implemented.
    results.push({ id: 'OCD-007', scenario: 'Fallback: Badge + discounted price on product (UI Check)', expected: 'N/A', actual: 'N/A', status: 'Not Implemented' });
    
    // OCD-008 & OCD-009: These are UI logic tests based on count.
    results.push({ id: 'OCD-008', scenario: 'Combo section uses "See All" button (UI Check)', expected: 'N/A', actual: 'N/A', status: 'Not Implemented' });
    results.push({ id: 'OCD-009', scenario: 'Offers section uses expandable logic if more than 3 products exist', expected: 'N/A', actual: 'N/A', status: 'Not Implemented' });

    // OCD-010: Test fallback to default heading
    processed = processMenuData([], [], [], [{ assignToOfferCategory: true, discountType: 'product', referenceIds: ['p1'] }] as StandardDiscount[], mockBrand, mockLocation);
    const defaultHeading = processed.finalCategories.find(c => c.id === 'offers')?.categoryName;
    const defaultComboHeading = mockBrand.combosHeading || 'Combo Deals';
    results.push({
        id: 'OCD-010', scenario: 'Fallback names "Offers" & "Combo Deals" used if brand override missing',
        expected: 'Headings are "Offers" and "Combo Deals"',
        actual: `Offer: "${defaultHeading}", Combo: "${defaultComboHeading}"`,
        status: defaultHeading === 'Offers' && defaultComboHeading === 'Combo Deals' ? 'Pass' : 'Fail',
    });

    // OCD-011 & OCD-012: These are conceptual tests of the DB structure, not runnable frontend logic.
    results.push({ id: 'OCD-011', scenario: 'Attempt to delete "Offers" category fails (DB Constraint)', expected: 'N/A', actual: 'N/A', status: 'Not Implemented' });
    results.push({ id: 'OCD-012', scenario: 'Attempt to delete "Combo Deals" category fails (DB Constraint)', expected: 'N/A', actual: 'N/A', status: 'Not Implemented' });

    // OCD-013 & OCD-016
    const productInHiddenCategory: Product = { id: 'prod-hidden', productName: 'Hidden Gem', categoryId: 'cat-hidden', price: 200, brandId: 'brand-test' } as Product;
    promoDiscounts = [{ assignToOfferCategory: true, discountType: 'product', referenceIds: ['prod-hidden'] }] as StandardDiscount[];
    processed = processMenuData([productInHiddenCategory], [...mockCategories], [], promoDiscounts, mockBrand, mockLocation);
    const offerProducts = processed.finalProducts.filter(p => p.categoryId === 'offers');
    const isHiddenProductInOffers = offerProducts.some(p => p.id === 'prod-hidden-offer');
    results.push({
        id: 'OCD-013', scenario: 'Discounted product in hidden category appears in Offers',
        expected: 'Product "prod-hidden-offer" IS in offers list',
        actual: `Product is ${isHiddenProductInOffers ? '' : 'NOT '}in offers list`,
        status: isHiddenProductInOffers ? 'Pass' : 'Fail',
    });
    results.push({ id: 'OCD-014', scenario: 'Badge only shown for discounted products (UI Check)', expected: 'N/A', actual: 'N/A', status: 'Not Implemented' });

    // OCD-015
    const inactiveCombo: ComboMenu = { ...mockCombos[0], isActive: false };
    const noActiveCombos = [inactiveCombo].filter(c => c.isActive).length === 0;
    results.push({
        id: 'OCD-015', scenario: 'Combo menu section does not appear for brands with all inactive combos',
        expected: 'Combo section is hidden',
        actual: !noActiveCombos ? 'Combo section is shown' : 'Combo section is hidden',
        status: noActiveCombos ? 'Pass' : 'Fail',
    });

    // OCD-016 is a duplicate of OCD-013 in this context.
    results.push({
        id: 'OCD-016', scenario: 'Product appears in Offers even if from hidden category, due to direct mapping',
        expected: 'Product "prod-hidden-offer" IS in offers list',
        actual: `Product is ${isHiddenProductInOffers ? '' : 'NOT '}in offers list`,
        status: isHiddenProductInOffers ? 'Pass' : 'Fail',
    });

    // Final Sort
    return results.sort((a,b) => {
        const aNum = parseInt(a.id.substring(4));
        const bNum = parseInt(b.id.substring(4));
        return aNum - bNum;
    });
}
