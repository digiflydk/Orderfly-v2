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