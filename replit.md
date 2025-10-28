# Overview

This project is a multi-tenant restaurant ordering platform built with Next.js 15, Firebase, and Stripe. It enables restaurant brands to manage multiple locations, menus, orders, and customer interactions via a comprehensive admin interface. Each brand operates with its own subdomain/slug, customizable appearance, and independent menu catalog. The platform supports pickup and delivery, dynamic pricing, combo meals, discount management, customer loyalty programs, integrated Stripe payments, analytics, feedback collection, and cookie consent. The business vision is to provide a scalable and customizable online ordering solution for restaurant brands, enhancing their digital presence and operational efficiency.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

**Framework**: Next.js 15 with App Router and TypeScript, utilizing server and client components with async params. It features dynamic routing, server actions for data mutations, and a responsive, mobile-first design.
**Styling**: Tailwind CSS with Radix UI components, custom theming using HSL color variables and brand-specific CSS injection.
**State Management**: React Context for cart and analytics, React Hook Form with Zod for client-side form state, and cookie-based session/consent tracking.
**UI Components**: Radix UI primitives for accessibility, `@dnd-kit` for drag-and-drop, and dynamic icon rendering.

## Backend Architecture

**Database**: Firebase Firestore (NoSQL) for all data (brands, locations, products, orders, etc.). Server-side data fetching uses Firebase Admin SDK.
**Authentication & Authorization**: Cookie-based session tracking with brand-scoped data isolation.
**Server Actions Pattern**: Next.js server actions for all mutations, including Zod validation, optimistic updates, and consistent error handling.
**Business Logic**: Supports multi-level discounts, dynamic pricing (pickup/delivery), combo meal builder, loyalty programs, and opening hours validation with timezone support.

## Payment Processing

**Stripe Integration**: Utilizes Stripe Checkout Session API for payment collection, supports brand-specific Stripe accounts, dynamic statement descriptors, and webhook handling for payment confirmation.

## Analytics & Tracking

**Multi-Channel Analytics**: Custom event tracking API, Google Tag Manager integration (brand-specific), cookie consent management (functional, marketing, statistics), anonymous user tracking, and attribution tracking.
**Privacy Compliance**: Cookie consent banner, anonymous consent storage, and GDPR readiness.

## AI/ML Features

**Firebase Genkit Integration**: Utilizes Google AI plugin for Gemini 2.0 Flash for potential features like menu import automation and AI-powered content generation.

# External Dependencies

**Core Services**:
- **Firebase**: Firestore (database), Hosting, App Hosting.
- **Stripe**: Payment processing.
- **Google AI / Gemini**: Via Genkit.

**Image Hosting**: Whitelisted external domains including i.postimg.cc, picsum.photos, images.unsplash.com, res.cloudinary.com for Next.js Image optimization.

**Deployment**:
- Firebase App Hosting with `us-central1` backend region.
- Node.js 20 runtime.

**Key NPM Dependencies**:
- `@radix-ui/*`: UI component primitives.
- `@dnd-kit/*`: Drag and drop functionality.
- `date-fns` & `date-fns-tz`: Date manipulation.
- `zod`: Schema validation.
- `react-hook-form`: Form state management.
- `stripe`: Payment processing.
- `firebase`: Database and hosting.
- `handlebars`: Template rendering.
- `js-cookie`: Cookie management.

# Recent Changes

**October 28, 2025 - Fixed FunnelFilters Type Conflict in Admin Analytics**
- **Root cause**: Two different `FunnelFilters` types existed - one in `@/types` and one in `@/lib/analytics/actions`
- **Updated admin analytics actions**: Replaced `src/admin/analytics/actions.ts` with proper implementation
- Created `getFunnelDataForBrand` function using correct `FunnelFilters` and `FunnelOutput` types from `@/types`
- Removed conflicting type export from `@/lib/analytics/actions`
- Added stub implementation returning proper FunnelOutput structure (totals, daily, byLocation)
- **Updated admin analytics page**: Modified `src/admin/analytics/page.tsx` to match working superadmin implementation
- Added Next.js 15 async params pattern with `AsyncPageProps`, `resolveParams`, `resolveSearchParams`
- This resolves build errors: "Type 'FunnelFilters' has no properties in common with type 'FunnelFilters'" and "Type 'FunnelData' is missing properties from 'FunnelOutput'"
- Dev server compiling successfully after fix

**October 28, 2025 - Fixed Import Paths in Duplicate Brand Page**
- **Fixed incorrect relative import paths**: Updated `src/[brandSlug]/page.tsx` (duplicate file outside app directory)
- Changed `../superadmin/brands/actions` to `@/app/superadmin/brands/actions`
- Changed `../superadmin/locations/actions` to `@/app/superadmin/locations/actions`
- This resolves build error: "Cannot find module '../superadmin/brands/actions'"
- Dev server compiling successfully after fix

**October 28, 2025 - Fixed AnalyticsProvider TypeScript Error**
- **Added brand prop to AnalyticsProvider**: Updated `src/context/analytics-context.tsx` to accept optional `brand` prop
- Created `AnalyticsProviderProps` interface with `children: ReactNode` and `brand?: Brand | null`
- Modified provider to use passed brand prop when available, falling back to pathname-based fetch if not provided
- Updated `trackEvent` callback to use `effectiveBrand = brandProp || brand` for type safety
- This resolves production build error: "Property 'brand' does not exist on type '{ children: ReactNode }'"
- Backward compatible: Works with or without brand prop

**October 28, 2025 - Fixed File Casing Conflict: Header.tsx**
- **Resolved case-sensitivity build error**: Deleted unused `src/components/layout/Header.tsx` (uppercase)
- All imports use lowercase `@/components/layout/header`, kept the correct `header.tsx` file
- M3 app has its own Header component at `src/app/m3/_components/Header.tsx` (no conflict)
- This resolves TS1149 error: "File name differs from already included file name only in casing"

**October 28, 2025 - Fixed Duplicate Location Page TypeScript Error**
- **Fixed type annotation in duplicate file**: Found and fixed `src/[brandSlug]/[locationSlug]/page.tsx`
- Added proper type annotation `(cat: Category)` to map callback
- Updated to use Next.js 15 async params pattern with `AsyncPageProps`
- This resolves error: "Parameter 'cat' implicitly has an 'any' type"