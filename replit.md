# Overview

This is a multi-tenant restaurant ordering platform built with Next.js 15, Firebase, and Stripe. The system enables restaurant brands to manage multiple locations, menus, orders, and customer interactions through a comprehensive admin interface. Each brand operates with its own subdomain/slug, customizable appearance, and independent menu catalog.

The platform supports both pickup and delivery ordering, dynamic pricing, combo meals, discount management, customer loyalty programs, and integrated payment processing through Stripe. It includes analytics tracking, feedback collection, and cookie consent management.

# Recent Changes

**October 19, 2025 - Production Build Fixes (Phase 3 - Complete)**
- Fixed all 20 superadmin dynamic route pages to use Next.js 15 async params pattern
- Updated categories, code-review, combos, customers, discounts, feedback, locations, products, QA, roles, settings, standard-discounts, toppings, upsells pages
- Fixed `src/lib/url.ts` to await `headers()` (Next.js 15 now returns Promise for headers)
- Updated checkout actions to await `getOrigin()` calls
- Added `.nvmrc` file with Node 20 specification
- Excluded `design/` folder from TypeScript compilation in `tsconfig.json`
- All Next.js 15 compatibility issues resolved - build ready for deployment

**October 19, 2025 - Production Build Fixes (Phase 2)**
- Fixed async params in `src/app/brand-safe/[brandSlug]/page.tsx` - converted to async function with Promise params
- Resolved Footer.tsx casing conflict by renaming `Footer.tsx` → `M3Footer.tsx` for M3-specific footer
- All imports now use consistent casing: main footer uses `@/components/layout/footer` (lowercase)
- Updated `src/app/m3/page.tsx` to import from `M3Footer` instead of `Footer`
- Node 20 configuration verified in `replit.nix` and `NIXPACKS_NODE_VERSION` environment variable
- Dev server running successfully with all routes compiling cleanly

**October 19, 2025 - Production Build Fixes (Phase 1)**
- Fixed Next.js 15 async params compatibility across all dynamic route pages
- Updated page components to use `Promise<{ params }>` pattern: `src/[brandSlug]/[locationSlug]/page.tsx`, checkout pages, confirmation pages
- Added health check endpoints: `/api/ok` and `/api/env` for deployment monitoring
- Created stub functions in `src/lib/firebase-admin.ts`: `adminHealthProbe()`, `getAdminFieldValue()`
- Fixed analytics bridge exports in `src/app/admin/analytics/actions.ts`
- Configured deployment settings for autoscale deployment with Node 20
- Environment variables verified: `NEXT_PUBLIC_M3_PREVIEW=true`, `NIXPACKS_NODE_VERSION=20`

**October 12, 2025 - OF-158: M3 Preview Feature**
- Implemented M3 preview routes in `src/app/m3/` with Next.js 15 async params compatibility
- Added feature flag system (`NEXT_PUBLIC_M3_PREVIEW=true`) to enable/disable M3 preview
- Created mock menu structure for testing (Esmeralda Pizza Amager location)
- Routes: `/m3` (index), `/m3/[brandSlug]/[locationSlug]` (location-specific)
- New components: `MenuList` (client component for menu items display)
- New files: `src/lib/feature-flags.ts`, `src/app/m3/_data/mock.ts`, `src/app/m3/_components/MenuList.tsx`

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

**Framework**: Next.js 15 with App Router and TypeScript
- Server and client components pattern with async params
- Dynamic routing using `[brandSlug]` and location-specific routes
- Server actions for data mutations
- Tailwind CSS with Radix UI components for styling
- Custom theming system with HSL color variables and brand-specific CSS injection

**State Management**:
- React Context for cart management (`CartProvider`)
- React Context for analytics tracking (`AnalyticsProvider`)
- Client-side form state with React Hook Form and Zod validation
- Cookie-based session and consent tracking

**UI Components**:
- Radix UI primitives for accessible components (Dialog, Dropdown, Select, etc.)
- Custom drag-and-drop interfaces using `@dnd-kit` for sortable categories
- Responsive design with mobile-first approach
- Dynamic icon rendering system for categories and allergens

## Backend Architecture

**Database**: Firebase Firestore (NoSQL document database)
- Collections: brands, locations, products, categories, orders, customers, feedback, discounts, allergens, toppings, combo_menus, subscriptions, settings
- Server-side data fetching with Firebase Admin SDK
- Real-time capabilities (not actively used but available)
- Timestamp fields use Firestore Timestamp type, converted to Date objects on client

**Authentication & Authorization**:
- Cookie-based session tracking (`orderfly_session_id`, `orderfly_anonymous_id`)
- Brand-scoped data isolation through brandId and locationIds filters
- Admin routes protected (implementation details not shown in provided code)
- Customer tracking with anonymous-to-authenticated user linking

**Server Actions Pattern**:
- All mutations through Next.js server actions
- Zod schema validation for form inputs
- Optimistic updates with revalidatePath
- Consistent error handling with FormState return type

**Business Logic**:
- Multi-level discount system (voucher codes, standard offers, item-level, cart-level)
- Dynamic pricing based on delivery type (pickup vs delivery)
- Combo meal builder with product groups and selection constraints
- Loyalty points calculation and redemption
- Opening hours validation with timezone support (date-fns-tz)

## Payment Processing

**Stripe Integration**:
- Checkout Session API for payment collection
- Brand-specific Stripe accounts (stored in settings)
- Dynamic statement descriptors using brand and location names
- Webhook handling for payment confirmation
- Support for test and live modes

**Order Flow**:
1. Cart assembly with pricing calculation
2. Discount application (vouchers + standard offers)
3. Stripe Checkout Session creation
4. Payment capture via Stripe
5. Order confirmation with email notification (implied)
6. Webhook verification and order status update

## Analytics & Tracking

**Multi-Channel Analytics**:
- Custom event tracking API (`/api/analytics`)
- Google Tag Manager integration (brand-specific GTM IDs supported)
- Cookie consent management with granular categories (functional, marketing, statistics)
- Anonymous user tracking with consent linking
- Attribution tracking (UTM parameters, referrer, landing page)

**Event Types**: page_view, add_to_cart, remove_from_cart, view_product, checkout_initiated, order_completed, etc.

**Privacy Compliance**:
- Cookie consent banner with customizable text per brand
- Anonymous consent storage before user authentication
- Consent migration from anonymous to authenticated users
- GDPR-ready with opt-in/opt-out capabilities

## AI/ML Features

**Firebase Genkit Integration**:
- Google AI plugin for Gemini 2.0 Flash model
- Menu import flow automation (referenced but not shown in detail)
- AI-powered content generation capabilities

## External Dependencies

**Core Services**:
- Firebase (Firestore, Hosting, App Hosting)
- Stripe (Payment processing)
- Google AI / Gemini (via Genkit)

**Image Hosting**: 
- External domains whitelisted: i.postimg.cc, picsum.photos, images.unsplash.com, res.cloudinary.com
- Next.js Image optimization with remote patterns

**Deployment**:
- Firebase App Hosting with backend region us-central1
- Node.js 18 runtime (configured via Nix)
- Next.js build process with custom prebuild scripts (codemods, assertions)

**Key NPM Dependencies**:
- @radix-ui/* - UI component primitives
- @dnd-kit/* - Drag and drop functionality
- date-fns & date-fns-tz - Date manipulation with timezone support
- zod - Schema validation
- react-hook-form - Form state management
- stripe - Payment processing
- firebase - Database and hosting
- handlebars - Template rendering
- js-cookie - Cookie management

**Development Tools**:
- TypeScript strict mode
- ESLint for code quality
- Webpack custom configuration for warning suppression
- Custom build-time checks (route params validation, Next.js manifest verification)