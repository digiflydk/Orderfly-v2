# Overview

Orderfly Studio is a multi-tenant food ordering platform built with Next.js 15 (App Router), Firebase/Firestore, and Stripe. The system enables brands to manage multiple locations, menus, products, orders, customer feedback, and subscriptions through a comprehensive superadmin interface. The platform supports both pickup and delivery order types with dynamic pricing, discount systems, loyalty programs, and AI-powered features via Google Genkit.

Key capabilities include:
- Multi-brand management with custom theming per brand
- Location-based menu and product management
- Advanced discount and loyalty systems
- Customer feedback collection and moderation
- Real-time order processing with Stripe payments
- Analytics and cookie consent management
- OpenAPI documentation for API endpoints

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

**Framework**: Next.js 15 with App Router and React Server Components (RSC)

**Routing Strategy**: 
- Dynamic routing with `[brandSlug]` for multi-tenant brand pages
- Nested routes under `/superadmin` for administrative functions
- Server-side rendering for SEO and performance optimization

**State Management**:
- React Context API for global state (CartContext, AnalyticsContext, ThemeContext)
- Client-side state management with React hooks and transitions
- Cookie-based session and consent management via `js-cookie`

**UI Component System**:
- Radix UI primitives for accessible, unstyled components
- Tailwind CSS for styling with CSS custom properties for theming
- `class-variance-authority` and `clsx` for dynamic className composition
- Shadcn/ui component patterns for consistent design system

**Form Handling**:
- React Hook Form with Zod validation resolvers
- Server Actions for form submission
- `useFormState` pattern for progressive enhancement

**Drag and Drop**:
- DnD Kit for sortable lists (categories, products)
- Touch and keyboard sensor support for accessibility

## Backend Architecture

**Runtime**: Node.js (specified in route configs with `export const runtime = "nodejs"`)

**Server Actions Pattern**:
- Server-side form processing with `'use server'` directive
- Return shape: `{ ok: boolean, id?: string, error?: string, message?: string }`
- Revalidation via `revalidatePath()` after mutations
- Redirect on success using Next.js `redirect()`

**API Routes**:
- Debug endpoints (`/api/debug/all`, `/api/debug/feedback`) for operational monitoring
- Health checks and diagnostic endpoints
- OpenAPI/Swagger documentation at `/api/docs` and `/api/redoc`

**Data Validation**:
- Zod schemas for runtime type safety
- Schema-to-OpenAPI conversion via `@asteasolutions/zod-to-openapi`
- Centralized validation logic in server actions

**Error Handling**:
- Global error boundaries at root and `/superadmin` routes
- Structured error responses from server actions
- Client-side toast notifications for user feedback

## Data Storage

**Database**: Google Firestore (NoSQL document database)

**Collections Structure**:
- `brands` - Multi-tenant brand configurations
- `locations` - Physical locations per brand
- `products` - Menu items with pricing per order type
- `categories` - Product categorization
- `combos` - Combo meals with product groups
- `toppings` - Add-ons and modifications
- `orders` - Order transactions
- `customers` - Customer profiles with loyalty data
- `feedback` - Customer feedback entries
- `feedbackQuestionsVersion` - Versioned feedback questionnaires
- `discounts` - Promotional discount codes
- `standardDiscounts` - Automated offer rules
- `subscriptions` - Brand subscription status
- `subscriptionPlans` - Available subscription tiers
- `allergens` - Allergen information
- `upsells` - Cross-sell and upsell items
- `settings/*` - Application configuration (general, loyalty, Stripe keys)
- `website/*` - CMS content (header, footer, sections)
- `anonymous_cookie_consents` - Pre-authentication consent tracking

**Data Access Patterns**:
- Firebase Client SDK (`firebase` package) for frontend queries
- Firebase Admin SDK (`firebase-admin`) for server-side operations with elevated privileges
- Query optimization with indexes on frequently filtered fields (e.g., `updatedAt DESC`)
- Batch operations for multi-document updates

**Schema Philosophy**:
- Denormalization for read performance (e.g., storing `brandName` with orders)
- Redundant `id` field in documents matching Firestore document ID
- Timestamp fields: `createdAt`, `updatedAt` as Firestore Timestamps
- Array fields for multi-select relationships (e.g., `locationIds`, `orderTypes`)

## Authentication and Authorization

**Authentication**: Firebase Authentication (client and admin)

**Authorization Model**:
- Brand-level isolation (data scoped by `brandId`)
- Location-level permissions (users associated with specific locations)
- Superadmin role for cross-brand management
- Customer authentication for order history and loyalty tracking

**Session Management**:
- Firebase session cookies for server-side auth verification
- Anonymous session IDs for pre-auth tracking
- Cookie consent linked to customer records post-authentication

## External Service Integrations

**Payment Processing**: Stripe
- Checkout Sessions for payment collection
- Webhooks for payment confirmation
- Customer and subscription management
- Statement descriptor customization per brand/location
- Secret key management per environment (test/live toggle in settings)

**AI Services**: Google Genkit + Vertex AI
- `@genkit-ai/firebase` and `@genkit-ai/googleai` for AI flows
- Model: `googleai/gemini-2.0-flash`
- Use case: Menu import automation (in `/src/ai/flows/menu-import.ts`)

**Hosting**: Firebase App Hosting
- Configuration in `firebase.json`
- Backend region: `us-central1`
- Build process with custom prebuild scripts (codemods, manifest checks)

**Image Hosting**: 
- External domains allowed: Cloudinary, Unsplash, Postimg, Picsum
- Configured in `next.config.js` under `remotePatterns`

**Analytics**: 
- Custom analytics context tracking user sessions, attribution, and consent
- Server-side event tracking via `trackClientEvent` utility
- Cookie-based attribution with UTM parameter capture

**Third-Party Libraries**:
- `date-fns` and `date-fns-tz` for timezone-aware date handling (Europe/Copenhagen)
- `handlebars` for template rendering
- `embla-carousel-react` for carousels
- OpenTelemetry API for observability hooks

## Key Design Decisions

**Multi-Tenancy Approach**:
- **Problem**: Support multiple brands with isolated data and custom branding
- **Solution**: Brand slug-based routing with Firestore security rules and scoped queries
- **Rationale**: Allows brand-specific URLs, theming via CSS variables, and data isolation without separate deployments

**Server Actions vs. API Routes**:
- **Problem**: Choose between RSC Server Actions and traditional API routes
- **Solution**: Server Actions for form mutations, API routes for debug/documentation endpoints
- **Rationale**: Server Actions provide better DX with co-location and type safety, while API routes enable OpenAPI documentation and external tooling

**Discount System Architecture**:
- **Problem**: Support complex, stackable discount rules with various conditions
- **Solution**: Separate `discounts` (voucher codes) and `standardDiscounts` (automated offers) collections with client-side calculation logic
- **Rationale**: Prevents race conditions, allows real-time price updates, and provides transparency to users

**Feedback Versioning**:
- **Problem**: Allow evolving feedback forms without breaking historical data
- **Solution**: `feedbackQuestionsVersion` collection with immutable versions linked to feedback entries
- **Rationale**: Enables A/B testing, multilingual support, and temporal analysis without migration scripts

**Environment Configuration**:
- **Problem**: Manage multiple Firebase projects and Stripe accounts
- **Solution**: Runtime environment variables with Firestore-based settings override
- **Rationale**: Supports dev/staging/prod workflows and allows non-technical users to toggle test/live modes

**Timezone Handling**:
- **Problem**: Consistent date/time handling across user locations
- **Solution**: Standardize on `Europe/Copenhagen` timezone with `date-fns-tz`
- **Rationale**: Business requirement for Danish market; centralized timezone prevents conversion errors

**Form State Management**:
- **Problem**: Handle complex multi-step forms with validation
- **Solution**: React Hook Form with Zod schemas, `useFormState` for server-side validation
- **Pros**: Type-safe validation, progressive enhancement, excellent DX
- **Cons**: Learning curve for Zod schema syntax

**Cart Persistence**:
- **Problem**: Maintain cart state across page navigations
- **Solution**: React Context with no persistence (session-only cart)
- **Rationale**: Simplicity and privacy; users expect fresh cart on return visits for food ordering