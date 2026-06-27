# PCCraft Marketplace — Master Specification v4.0

> **For Claude Code:** Read this entire document before writing a single line of code.
> Build **one module at a time**, in the order listed in Part 3.
> Never regenerate a completed module unless explicitly instructed.
> Always maintain full consistency with previously generated code.
> Every file you create must land in the exact path defined in Part 1.3.

---

## PART 1 — PROJECT IDENTITY, DESIGN SYSTEM & FOLDER STRUCTURE

### 1.1 Project Overview

PCCraft Marketplace is a production-grade **multi-vendor e-commerce platform** specializing in
computers, laptops, peripherals, and PC components. It goes beyond standard e-commerce by
offering:

- An intelligent **PC compatibility checker** (data-driven, not hardcoded)
- A multi-algorithm **recommendation engine**
- A **trade-licensed vendor verification** workflow
- A structured **returns & refund policy** system
- A **role-based login** experience with distinct dashboards per role

The project is a semester submission but must be architecturally sound enough to evolve into a
real commercial product.

---

### 1.2 Color System & Design Language

The entire UI must follow this design system. No improvisation allowed.

**Single theme only — no dark mode toggle, no theme switching.**
The design uses dark navy chrome (sidebar, navbar) against a light content surface.
This creates strong visual structure without a full dark-mode system.

#### Chrome Palette — Structural / Navigation Elements

| Token         | Hex       | Usage                                               |
|---------------|-----------|-----------------------------------------------------|
| `primary-900` | `#0F172A` | Sidebar background                                  |
| `primary-800` | `#1E293B` | Navbar / top bar background                         |
| `primary-700` | `#334155` | Active nav items, hover states on chrome            |

#### Surface Palette — Page & Content Areas

| Token          | Hex       | Usage                                              |
|----------------|-----------|----------------------------------------------------|
| `surface-50`   | `#FFFFFF` | Cards, modals, form panels                         |
| `surface-100`  | `#F8FAFC` | Page / app background (main background color)      |
| `surface-200`  | `#F1F5F9` | Input backgrounds, alternating table rows          |
| `surface-300`  | `#E2E8F0` | Borders, dividers, separators                      |

#### Accent / Action Palette

| Token        | Hex       | Usage                                                |
|--------------|-----------|------------------------------------------------------|
| `accent-500` | `#6366F1` | Primary CTA buttons, links, focus rings (Indigo)     |
| `accent-400` | `#818CF8` | Hover state on accent elements                       |
| `accent-300` | `#A5B4FC` | Disabled accent, subtle highlights                   |

#### Text Tokens

| Token            | Hex       | Usage                                              |
|------------------|-----------|----------------------------------------------------|
| `text-primary`   | `#0F172A` | Main body text on light surfaces                   |
| `text-secondary` | `#64748B` | Subtext, placeholders, metadata on light surfaces  |
| `text-inverse`   | `#F1F5F9` | Text on dark chrome elements (sidebar, navbar)     |

#### Semantic Tokens

| Token     | Hex       | Usage                                  |
|-----------|-----------|----------------------------------------|
| `success` | `#22C55E` | Order confirmed, verified badges       |
| `warning` | `#F59E0B` | Pending states, low stock alerts       |
| `danger`  | `#EF4444` | Errors, destructive actions, out of stock |
| `info`    | `#38BDF8` | Info banners, tooltips                 |

#### Design Rules

- **Single light theme** — `surface-100` (`#F8FAFC`) is the app background. No dark mode.
  No `ThemeToggle`. No `useThemeStore`. No class switching on `<html>`.
- Sidebar always renders with `bg-primary-900`; navbar with `bg-primary-800`.
  All text on those dark elements uses `text-inverse`.
- All page content, cards, and modals render on light surfaces (`surface-50` / `surface-100`).
  All text in content areas uses `text-primary` or `text-secondary`.
- Typography: `Inter` (body), `Space Grotesk` (headings) — load via Google Fonts
- Border radius: `rounded-xl` for cards, `rounded-lg` for buttons, `rounded-full` for badges
- Shadows: `shadow-sm` on cards; `shadow-lg` with `shadow-indigo-500/20` glow on accent CTAs
- Spacing: 8px base grid, consistent `gap-4` / `gap-6` in layouts
- All icons: Lucide React only — no mixing icon libraries
- Transitions: `transition-all duration-200 ease-in-out` on every interactive element
- Skeleton loaders on every component that awaits async data
- **Tailwind v4 config:** all design tokens defined once in `src/styles/globals.css` under `@theme {}`
  (see Module 0 step 4 for full block). There is no `tailwind.config.js`. All tokens become
  utility classes automatically: `bg-primary-900`, `text-accent-500`, `border-danger`, etc.

---

### 1.3 Project Folder Structure

This is the **canonical layout** for the entire repository. Every file Claude Code generates
must be placed at the exact path shown. Do not invent new top-level folders.

```
PCCraft-Marketplace/
│
├── frontend/                              # React 19 + Vite + Tailwind CSS v4
│   ├── public/                            # Static assets served as-is (favicon, og-image, etc.)
│   │
│   └── src/
│       ├── assets/                        # Bundled static assets (imported in JS/CSS)
│       │   ├── images/                    # Raster images (jpg/png/webp)
│       │   ├── icons/                     # SVG icon files (fallback if Lucide insufficient)
│       │   └── logos/                     # PCCraft logo variants (default/icon-only)
│       │
│       ├── components/                    # Reusable, presentational components
│       │   ├── common/                    # Truly generic UI primitives
│       │   │   ├── Button.jsx             # Variants: primary | secondary | danger | ghost
│       │   │   ├── Input.jsx              # With label, error state, helper text
│       │   │   ├── Badge.jsx              # Status/label badges (rounded-full)
│       │   │   ├── Card.jsx               # Base card wrapper (rounded-xl, shadow-lg)
│       │   │   ├── Modal.jsx              # Accessible dialog with backdrop + Framer Motion
│       │   │   ├── Skeleton.jsx           # Configurable skeleton block for loading states
│       │   │   ├── Spinner.jsx            # Inline loading spinner
│       │   │   ├── Pagination.jsx         # Page controls with prev/next + numbered links
│       │   │   ├── Stepper.jsx            # Multi-step progress indicator
│       │   │   ├── DropdownMenu.jsx       # Accessible dropdown (keyboard navigable)
│       │   │   ├── Tooltip.jsx            # Hover tooltip with portal rendering
│       │   │   ├── EmptyState.jsx         # Zero-results illustration + message + CTA
│       │   │   ├── ErrorState.jsx         # Error illustration + message + retry button
│       │   │   ├── ConfirmDialog.jsx      # Destructive-action confirmation modal
│       │   │   ├── FileUpload.jsx         # Drag-and-drop file input with preview
│       │   │   ├── ImageGallery.jsx       # Main image + thumbnail strip
│       │   │   ├── RatingStars.jsx        # Interactive or display-only star rating
│       │   │   ├── PriceDisplay.jsx       # Base price + strike-through discount + badge
│       │   │   └── SkeletonLoader.jsx     # Generic skeleton loader component
│       │   │
│       │   ├── layout/                    # App-wide structural components
│       │   │   ├── Navbar.jsx             # Role-aware top navigation bar
│       │   │   ├── Sidebar.jsx            # Collapsible sidebar (Admin + Vendor panels)
│       │   │   ├── Footer.jsx             # Site footer with links
│       │   │   ├── PageWrapper.jsx        # Adds consistent page padding + max-width
│       │   │   └── ScrollToTop.jsx        # Resets scroll on route change
│       │   │
│       │   ├── products/                  # Product-display components
│       │   │   ├── ProductCard.jsx        # Grid card: image, name, price, badges, actions
│       │   │   ├── ProductGrid.jsx        # Responsive grid of ProductCards + skeleton set
│       │   │   ├── ProductFilters.jsx     # Sidebar: category tree, brands, price, stock
│       │   │   ├── ProductSpecsTable.jsx  # Key-value spec display (category-aware)
│       │   │   └── StockBadge.jsx        # In stock / Low stock / Out of stock badge
│       │   │
│       │   ├── cart/                      # Cart UI components
│       │   │   ├── CartDrawer.jsx         # Slide-in cart sidebar
│       │   │   ├── CartItem.jsx           # Single row: image, name, qty stepper, remove
│       │   │   └── CartSummary.jsx        # Subtotal + proceed CTA
│       │   │
│       │   ├── wishlist/                  # Wishlist UI components
│       │   │   └── WishlistCard.jsx       # Product card variant with move-to-cart action
│       │   │
│       │   ├── recommendation/            # Recommendation display components
│       │   │   └── RecommendationCarousel.jsx  # Horizontal scroll carousel of ProductCards
│       │   │
│       │   ├── compatibility/             # PC Builder UI components
│       │   │   ├── SlotCard.jsx           # Empty/filled component slot in builder
│       │   │   ├── CompatibilityReport.jsx # Accordion of rule-check results (OK/WARN/ERR)
│       │   │   └── WattageDisplay.jsx     # Live estimated wattage total
│       │   │
│       │   └── dashboard/                 # Shared chart + stat components (Admin + Vendor)
│       │       ├── KPICard.jsx            # Metric card: icon, label, value, delta %
│       │       ├── RevenueChart.jsx       # Recharts LineChart wrapper
│       │       ├── OrderStatusChart.jsx   # Recharts BarChart wrapper
│       │       ├── CategoryPieChart.jsx   # Recharts PieChart wrapper
│       │       └── StatsTable.jsx         # Sortable data table for top products/vendors
│       │
│       ├── pages/                         # Route-level page components (one folder per route)
│       │   ├── Home/
│       │   │   └── HomePage.jsx           # Hero + trending + personalized recommendations
│       │   ├── Login/
│       │   │   └── LoginPage.jsx          # Role selector + login form
│       │   ├── Register/
│       │   │   ├── CustomerRegisterPage.jsx
│       │   │   └── VendorRegisterPage.jsx # Multi-step vendor registration
│       │   ├── Products/
│       │   │   └── ShopPage.jsx           # Product listing with filters + pagination
│       │   ├── ProductDetails/
│       │   │   └── ProductDetailPage.jsx  # Gallery, specs, reviews, recommendations
│       │   ├── Categories/
│       │   │   └── CategoryPage.jsx       # Shop filtered by a single category
│       │   ├── Cart/
│       │   │   └── CartPage.jsx           # Full-page cart view
│       │   ├── Wishlist/
│       │   │   └── WishlistPage.jsx
│       │   ├── Checkout/
│       │   │   ├── CheckoutPage.jsx       # 4-step checkout stepper
│       │   │   └── OrderConfirmPage.jsx   # Post-order confirmation screen
│       │   ├── Orders/
│       │   │   ├── OrderHistoryPage.jsx
│       │   │   └── OrderDetailPage.jsx
│       │   ├── Profile/
│       │   │   ├── CustomerProfilePage.jsx
│       │   │   └── VendorProfilePage.jsx
│       │   ├── Returns/
│       │   │   ├── ReturnRequestPage.jsx  # Initiate a return for a delivered order item
│       │   │   └── ReturnStatusPage.jsx   # Track return / refund status
│       │   ├── Search/
│       │   │   └── SearchResultsPage.jsx
│       │   ├── PCBuilder/
│       │   │   ├── PCBuilderPage.jsx
│       │   │   ├── MyBuildsPage.jsx       # List of customer's saved builds
│       │   │   └── SharedBuildPage.jsx    # Read-only public build view
│       │   ├── Vendor/
│       │   │   ├── VendorDashboardPage.jsx
│       │   │   ├── VendorStorePage.jsx
│       │   │   ├── VendorProductListPage.jsx
│       │   │   ├── VendorProductFormPage.jsx
│       │   │   ├── VendorOrdersPage.jsx
│       │   │   ├── VendorReturnsPage.jsx
│       │   │   └── VendorReviewsPage.jsx    # All reviews for vendor's products (Module 6)
│       │   ├── Admin/
│       │   │   ├── AdminDashboardPage.jsx
│       │   │   ├── AdminUsersPage.jsx
│       │   │   ├── AdminVendorApprovalPage.jsx
│       │   │   ├── AdminProductsPage.jsx
│       │   │   ├── AdminCategoriesPage.jsx
│       │   │   ├── AdminBrandsPage.jsx
│       │   │   ├── AdminOrdersPage.jsx
│       │   │   ├── AdminOrderDetailPage.jsx  # Read-only full order view for admin
│       │   │   ├── AdminReturnsPage.jsx
│       │   │   ├── AdminReviewsPage.jsx
│       │   │   └── AdminCompatibilityPage.jsx
│       │   └── NotFound/
│       │       ├── NotFoundPage.jsx       # 404
│       │       └── UnauthorizedPage.jsx   # 403
│       │
│       ├── services/                      # Axios API call functions (one file per domain)
│       │   ├── axiosInstance.js           # Configured Axios instance + JWT interceptors
│       │   ├── authService.js             # login, register, logout, refresh, profile
│       │   ├── productService.js          # list, detail, create, update, delete, track-view
│       │   ├── categoryService.js
│       │   ├── brandService.js
│       │   ├── cartService.js
│       │   ├── wishlistService.js
│       │   ├── orderService.js
│       │   ├── returnService.js
│       │   ├── reviewService.js
│       │   ├── recommendationService.js
│       │   ├── compatibilityService.js
│       │   ├── searchService.js
│       │   ├── vendorService.js
│       │   └── adminService.js
│       │
│       ├── context/                       # Zustand stores + React Context providers
│       │   ├── useAuthStore.js            # user, token, role, isAuthenticated, setAuth, clearAuth
│       │   ├── useCartStore.js            # items, addItem, removeItem, updateQty, totals
│       │   └── useWishlistStore.js        # wishlistIds set for O(1) heart-icon checks
│       │
│       ├── hooks/                         # Custom React hooks
│       │   ├── useDebounce.js             # Debounce a value (used in search bar)
│       │   ├── useLocalStorage.js         # Sync state to localStorage
│       │   ├── useIntersectionObserver.js # Lazy-load / infinite scroll trigger
│       │   ├── useClickOutside.js         # Close dropdowns/modals on outside click
│       │   ├── usePageTitle.js            # Set document.title per page
│       │   └── usePCBuilder.js            # PC Builder state + localStorage persistence (Module 8)
│       │
│       ├── routes/                        # React Router v8 route definitions
│       │   ├── AppRouter.jsx              # Root router with all route declarations
│       │   ├── ProtectedRoute.jsx         # Checks isAuthenticated + role match
│       │   └── routePaths.js             # Exported path constants (avoid magic strings)
│       │
│       ├── utils/                         # Pure helper functions (no side-effects)
│       │   ├── formatters.js              # formatPrice, formatDate, formatOrderNumber
│       │   ├── validators.js              # Zod schemas for phone, email, password
│       │   ├── slugify.js                 # Client-side slug preview helper
│       │   └── constants.js              # ROLES, ORDER_STATUSES, RETURN_REASONS enums
│       │
│       ├── styles/                        # Global styles and Tailwind overrides
│       │   ├── globals.css                # @tailwind base/components/utilities + font import
│       │   └── animations.css             # Custom keyframe animations (if Framer insufficient)
│       │
│       ├── App.jsx                        # Root component: providers + RouterProvider
│       └── main.jsx                       # ReactDOM.createRoot entry point
│
│   ├── index.html                         # Vite HTML entry (Google Fonts link tags here)
│   ├── vite.config.js                     # Vite config with @tailwindcss/vite plugin + path aliases
│   └── package.json
│                                          # NOTE: No tailwind.config.js or postcss.config.js —
│                                          # Tailwind v4 is configured via @theme block in globals.css
│
├── backend/                               # Django 6.0+ + DRF
│   │
│   ├── config/                            # Project-level Django config (NOT an app)
│   │   ├── settings/
│   │   │   ├── __init__.py                # Imports development or production based on ENV
│   │   │   ├── base.py                    # Shared settings (apps, middleware, auth, etc.)
│   │   │   ├── development.py             # DEBUG=True, local DB, CORS allow-all
│   │   │   └── production.py             # DEBUG=False, S3, secure cookies, etc.
│   │   ├── urls.py                        # Root URL conf (includes each app's urls.py)
│   │   ├── asgi.py
│   │   ├── wsgi.py
│   │   └── __init__.py
│   │
│   ├── apps/                              # All Django applications live here
│   │   │
│   │   ├── common/                        # Shared utilities used by all other apps
│   │   │   ├── models.py                  # TimeStampedModel (abstract base)
│   │   │   ├── response.py                # APIResponse.success() / APIResponse.error()
│   │   │   ├── permissions.py            # IsCustomer, IsVendor, IsAdmin, IsApprovedVendor
│   │   │   ├── pagination.py             # StandardResultsPagination (page_size=20)
│   │   │   ├── validators.py             # File MIME-type validator, phone validator
│   │   │   └── exceptions.py             # Custom DRF exception handler
│   │   │
│   │   ├── accounts/                      # Module 1 — Auth & User Profiles
│   │   │   ├── migrations/
│   │   │   ├── models.py                  # CustomUser, CustomerProfile, VendorProfile
│   │   │   ├── managers.py               # CustomUserManager (email as username)
│   │   │   ├── serializers.py
│   │   │   ├── views.py
│   │   │   ├── urls.py
│   │   │   ├── services.py               # AuthService (register, login logic)
│   │   │   ├── permissions.py            # (re-exports from common or extends)
│   │   │   └── admin.py
│   │   │
│   │   ├── categories/                    # Module 2 — Categories
│   │   │   ├── migrations/
│   │   │   ├── models.py                  # Category (with self-FK parent)
│   │   │   ├── serializers.py
│   │   │   ├── views.py
│   │   │   ├── urls.py
│   │   │   └── admin.py
│   │   │
│   │   ├── brands/                        # Module 2 — Brands
│   │   │   ├── migrations/
│   │   │   ├── models.py
│   │   │   ├── serializers.py
│   │   │   ├── views.py
│   │   │   ├── urls.py
│   │   │   └── admin.py
│   │   │
│   │   ├── products/                      # Module 2 — Products
│   │   │   ├── migrations/
│   │   │   ├── models.py                  # Product, ProductImage, PriceHistory
│   │   │   ├── serializers.py
│   │   │   ├── views.py
│   │   │   ├── urls.py
│   │   │   ├── services.py               # ProductService (create, update, stock logic)
│   │   │   ├── filters.py                # django-filter FilterSet for products
│   │   │   └── admin.py
│   │   │
│   │   ├── cart/                          # Module 3 — Cart
│   │   │   ├── migrations/
│   │   │   ├── models.py                  # Cart, CartItem
│   │   │   ├── serializers.py
│   │   │   ├── views.py
│   │   │   ├── urls.py
│   │   │   └── services.py               # CartService (add, update, validate stock)
│   │   │
│   │   ├── wishlist/                      # Module 3 — Wishlist
│   │   │   ├── migrations/
│   │   │   ├── models.py                  # Wishlist, WishlistItem
│   │   │   ├── serializers.py
│   │   │   ├── views.py
│   │   │   └── urls.py
│   │   │
│   │   ├── orders/                        # Module 4 + 5 — Orders & Returns
│   │   │   ├── migrations/
│   │   │   ├── models.py                  # ShippingAddress, Order, OrderItem,
│   │   │   │                              # ReturnRequest, ReturnEvidence
│   │   │   ├── serializers.py
│   │   │   ├── views.py
│   │   │   ├── urls.py
│   │   │   ├── services.py               # OrderService, ReturnService
│   │   │   └── admin.py
│   │   │
│   │   ├── reviews/                       # Module 6 — Reviews & Ratings
│   │   │   ├── migrations/
│   │   │   ├── models.py                  # Review, ReviewImage
│   │   │   ├── serializers.py
│   │   │   ├── views.py
│   │   │   ├── urls.py
│   │   │   └── services.py               # ReviewService (verified-purchase check)
│   │   │
│   │   ├── recommendations/               # Module 7 — Recommendation Engine
│   │   │   ├── migrations/
│   │   │   ├── models.py                  # ProductView
│   │   │   ├── serializers.py
│   │   │   ├── views.py
│   │   │   ├── urls.py
│   │   │   ├── engine.py                  # RecommendationEngine base class + Mixer
│   │   │   ├── strategies/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── content_based.py
│   │   │   │   ├── co_occurrence.py
│   │   │   │   ├── trending.py
│   │   │   │   ├── personalized.py
│   │   │   │   └── compatibility.py
│   │   │   └── tasks.py                   # Celery tasks (nightly cache refresh)
│   │   │
│   │   ├── compatibility/                 # Module 8 — PC Builder & Compatibility
│   │   │   ├── migrations/
│   │   │   ├── models.py                  # CompatibilityAttribute, CompatibilityRule,
│   │   │   │                              # PCBuild, PCBuildItem
│   │   │   ├── serializers.py
│   │   │   ├── views.py
│   │   │   ├── urls.py
│   │   │   └── services.py               # CompatibilityService (check_build, get_compatible)
│   │   │
│   │   └── dashboard/                     # Module 9 + 10 — Admin + Vendor Analytics
│   │       ├── __init__.py
│   │       ├── apps.py                    # DashboardConfig (no models — no migrations/)
│   │       ├── views.py                   # Admin analytics + Vendor overview endpoints
│   │       └── urls.py
│   │
│   ├── media/                             # User-uploaded files (served locally in dev)
│   │   ├── products/
│   │   │   └── images/%Y/%m/              # Product images (dynamic upload_to path)
│   │   ├── stores/
│   │   │   ├── logos/
│   │   │   └── banners/
│   │   ├── profiles/
│   │   │   └── avatars/
│   │   └── documents/
│   │       ├── trade_licenses/            # Vendor trade license uploads
│   │       └── nid_docs/                  # Vendor NID/passport uploads
│   │
│   ├── static/                            # Static files collected via collectstatic
│   ├── templates/                         # Email templates (HTML for Celery email tasks)
│   │   └── emails/
│   │       ├── vendor_approved.html
│   │       ├── vendor_rejected.html
│   │       └── order_confirmed.html
│   │
│   ├── manage.py
│   ├── requirements.txt                   # All dependencies with pinned versions
│   ├── celery.py                         # Celery app configuration
│   └── .env                              # Never committed — see .env.example
│
├── docs/                                  # Project documentation
│   ├── SRS.pdf                            # Software Requirements Specification
│   ├── Proposal.pdf
│   ├── API.md                             # Swagger link + endpoint group overview
│  
│
├── assets/                                # Non-bundled design assets
│   ├── logo/                              # Source files (SVG/AI/Figma exports)
│   ├── banners/
│   └── mockups/
│
├── screenshots/                           # UI screenshots for README
│
├── .gitignore
├── LICENSE
├── README.md
└── .env.example                           # Template for required env variables
```

#### 1.3.1 Internal Structure of Each Django App

Every app under `apps/` must follow this **exact internal file layout**. Claude Code must
create all these files even if initially empty (except migrations — Django generates those).

```
apps/[app_name]/
├── migrations/
│   └── __init__.py
├── __init__.py
├── admin.py            # ModelAdmin registrations for Django admin (separate from API)
├── apps.py             # AppConfig with name = 'apps.[app_name]'
├── models.py           # All models for this domain
├── managers.py         # Custom model managers (only if needed)
├── serializers.py      # DRF serializers (input + output, separate classes)
├── views.py            # DRF ViewSets or APIViews — NO business logic here
├── urls.py             # URL patterns for this app — included in config/urls.py
├── services.py         # ALL business logic lives here — views call services only
├── permissions.py      # App-specific DRF permission classes (imports from common)
├── filters.py          # django-filter FilterSet classes (only in apps that need it)
└── tests/
    ├── __init__.py
    ├── test_models.py
    ├── test_services.py
    └── test_views.py
```

#### 1.3.2 Key Path Aliases

Configure these aliases so imports stay clean across the codebase:

**Frontend (`vite.config.js`):**
```js
resolve: {
  alias: {
    '@':          '/src',
    '@components': '/src/components',
    '@pages':     '/src/pages',
    '@services':  '/src/services',
    '@context':   '/src/context',
    '@hooks':     '/src/hooks',
    '@utils':     '/src/utils',
    '@assets':    '/src/assets',
  }
}
```

**Backend (all imports use dotted app paths):**
```python
# In any app's views.py
from apps.common.response import APIResponse
from apps.common.permissions import IsApprovedVendor
from apps.products.services import ProductService
```

---

#### 1.3.3 Frontend Route Map

This is the **single source of truth** for every React route. `AppRouter.jsx` must declare routes
in exactly this structure. `routePaths.js` must export a constant for every path string.
Claude Code must use these paths consistently across all 12 modules — no ad-hoc path strings.

> **Layout key:** `MainLayout` = Navbar + Footer. `VendorLayout` = Vendor sidebar + header.
> `AdminLayout` = Admin sidebar + header. `AuthLayout` = centered card, no nav.
> `bare` = no layout wrapper (full-screen pages).

##### Public Routes (no authentication required)

| Path | Component | Layout | Notes |
|------|-----------|--------|-------|
| `/` | `HomePage` | `MainLayout` | Hero, trending, personalized if authed |
| `/shop` | `ShopPage` | `MainLayout` | Product listing with filters |
| `/categories/:categorySlug` | `CategoryPage` | `MainLayout` | Category-scoped shop |
| `/products/:slug` | `ProductDetailPage` | `MainLayout` | Gallery, specs, reviews, recs |
| `/stores/:storeSlug` | `VendorProfilePage` | `MainLayout` | Public vendor storefront |
| `/search` | `SearchResultsPage` | `MainLayout` | Full-text search results |
| `/builder` | `PCBuilderPage` | `MainLayout` | Anonymous uses localStorage |
| `/builds/share/:shareToken` | `SharedBuildPage` | `MainLayout` | Public read-only build |
| `/404` | `NotFoundPage` | `bare` | |
| `/403` | `UnauthorizedPage` | `bare` | |
| `*` | redirect → `/404` | — | Catch-all |

##### Guest-Only Routes (redirect to `/` if already authenticated)

| Path | Component | Layout | Notes |
|------|-----------|--------|-------|
| `/login` | `LoginPage` | `AuthLayout` | Role selector + credentials |
| `/register` | `CustomerRegisterPage` | `AuthLayout` | Customer registration |
| `/register/vendor` | `VendorRegisterPage` | `AuthLayout` | 4-step vendor registration |

##### Customer Routes (auth required, role = `CUSTOMER`)

| Path | Component | Layout | Notes |
|------|-----------|--------|-------|
| `/cart` | `CartPage` | `MainLayout` | |
| `/wishlist` | `WishlistPage` | `MainLayout` | |
| `/checkout` | `CheckoutPage` | `MainLayout` | 4-step stepper |
| `/checkout/confirm` | `OrderConfirmPage` | `MainLayout` | Post-payment confirmation |
| `/orders` | `OrderHistoryPage` | `MainLayout` | |
| `/orders/:orderNumber` | `OrderDetailPage` | `MainLayout` | |
| `/returns/new/:orderItemId` | `ReturnRequestPage` | `MainLayout` | Initiate return |
| `/returns/:returnId` | `ReturnStatusPage` | `MainLayout` | Track return status |
| `/profile` | `CustomerProfilePage` | `MainLayout` | |
| `/builds` | `MyBuildsPage` | `MainLayout` | List of saved PC builds |
| `/builds/:buildId` | `PCBuilderPage` | `MainLayout` | Load a saved build into builder |

##### Vendor Routes (auth required, role = `VENDOR`, approval = `APPROVED`)

| Path | Component | Layout | Notes |
|------|-----------|--------|-------|
| `/vendor/dashboard` | `VendorDashboardPage` | `VendorLayout` | |
| `/vendor/store` | `VendorStorePage` | `VendorLayout` | Store profile settings |
| `/vendor/products` | `VendorProductListPage` | `VendorLayout` | |
| `/vendor/products/new` | `VendorProductFormPage` | `VendorLayout` | Create product |
| `/vendor/products/:slug/edit` | `VendorProductFormPage` | `VendorLayout` | Edit product (same component) |
| `/vendor/orders` | `VendorOrdersPage` | `VendorLayout` | |
| `/vendor/returns` | `VendorReturnsPage` | `VendorLayout` | |
| `/vendor/reviews` | `VendorReviewsPage` | `VendorLayout` | |

> **Vendor pending/rejected gate:** if `user.vendor_profile.status !== 'APPROVED'`, all
> `/vendor/*` routes redirect to a status-aware banner page (rendered inside `VendorLayout`
> with no sidebar links), not `/403`.

##### Admin Routes (auth required, role = `ADMIN`)

| Path | Component | Layout | Notes |
|------|-----------|--------|-------|
| `/admin/dashboard` | `AdminDashboardPage` | `AdminLayout` | |
| `/admin/vendors` | `AdminVendorApprovalPage` | `AdminLayout` | Approval queue |
| `/admin/users` | `AdminUsersPage` | `AdminLayout` | |
| `/admin/products` | `AdminProductsPage` | `AdminLayout` | |
| `/admin/brands` | `AdminBrandsPage` | `AdminLayout` | |
| `/admin/categories` | `AdminCategoriesPage` | `AdminLayout` | |
| `/admin/orders` | `AdminOrdersPage` | `AdminLayout` | |
| `/admin/orders/:orderNumber` | `AdminOrderDetailPage` | `AdminLayout` | Read-only detail view |
| `/admin/returns` | `AdminReturnsPage` | `AdminLayout` | |
| `/admin/reviews` | `AdminReviewsPage` | `AdminLayout` | |
| `/admin/compatibility` | `AdminCompatibilityPage` | `AdminLayout` | Rules + attributes |

##### `routePaths.js` — Required Constants

```js
// src/routes/routePaths.js
export const PATHS = {
  // Public
  HOME:             '/',
  SHOP:             '/shop',
  CATEGORY:         '/categories/:categorySlug',
  PRODUCT_DETAIL:   '/products/:slug',
  VENDOR_STORE:     '/stores/:storeSlug',
  SEARCH:           '/search',
  BUILDER:          '/builder',
  BUILDER_LOAD:     '/builds/:buildId',
  BUILD_SHARE:      '/builds/share/:shareToken',
  NOT_FOUND:        '/404',
  UNAUTHORIZED:     '/403',

  // Guest-only
  LOGIN:            '/login',
  REGISTER:         '/register',
  VENDOR_REGISTER:  '/register/vendor',

  // Customer
  CART:             '/cart',
  WISHLIST:         '/wishlist',
  CHECKOUT:         '/checkout',
  ORDER_CONFIRM:    '/checkout/confirm',
  ORDERS:           '/orders',
  ORDER_DETAIL:     '/orders/:orderNumber',
  RETURN_NEW:       '/returns/new/:orderItemId',
  RETURN_STATUS:    '/returns/:returnId',
  PROFILE:          '/profile',
  MY_BUILDS:        '/builds',

  // Vendor
  VENDOR_DASHBOARD: '/vendor/dashboard',
  VENDOR_STORE_EDIT:'/vendor/store',
  VENDOR_PRODUCTS:  '/vendor/products',
  VENDOR_PRODUCT_NEW:  '/vendor/products/new',
  VENDOR_PRODUCT_EDIT: '/vendor/products/:slug/edit',
  VENDOR_ORDERS:    '/vendor/orders',
  VENDOR_RETURNS:   '/vendor/returns',
  VENDOR_REVIEWS:   '/vendor/reviews',

  // Admin
  ADMIN_DASHBOARD:  '/admin/dashboard',
  ADMIN_VENDORS:    '/admin/vendors',
  ADMIN_USERS:      '/admin/users',
  ADMIN_PRODUCTS:   '/admin/products',
  ADMIN_BRANDS:     '/admin/brands',
  ADMIN_CATEGORIES: '/admin/categories',
  ADMIN_ORDERS:     '/admin/orders',
  ADMIN_ORDER_DETAIL: '/admin/orders/:orderNumber',
  ADMIN_RETURNS:    '/admin/returns',
  ADMIN_REVIEWS:    '/admin/reviews',
  ADMIN_COMPAT:     '/admin/compatibility',
}

// Helper: build parameterised paths
// Usage: toPath(PATHS.PRODUCT_DETAIL, { slug: 'rtx-4090' }) → '/products/rtx-4090'
export const toPath = (pattern, params = {}) =>
  Object.entries(params).reduce(
    (p, [k, v]) => p.replace(`:${k}`, v), pattern
  )
```

### 2.1 Technology Stack

**OS:** Ubuntu 26.04 LTS

#### Frontend (pinned in `package.json`)

| Package | Version | Notes |
|---------|---------|-------|
| `react` | `^19.0.0` | New concurrent features; use `use()` hook where appropriate |
| `react-dom` | `^19.0.0` | Must match React version |
| `react-router-dom` | `^8.0.0` | Data router API; use `createBrowserRouter` + `RouterProvider` |
| `axios` | `^1.9.0` | HTTP client with interceptors |
| `@tanstack/react-query` | `^5.60.0` | Server state management; use v5 `queryOptions` helpers |
| `zustand` | `^5.0.0` | Client state; use `createStore` with `immer` middleware |
| `react-hook-form` | `^7.55.0` | Form state management |
| `zod` | `^3.24.0` | Schema validation |
| `@hookform/resolvers` | `^3.10.0` | Zod resolver bridge |
| `lucide-react` | `^0.470.0` | Icons — only this library |
| `react-hot-toast` | `^2.5.0` | Toast notifications |
| `framer-motion` | `^12.0.0` | Animations and transitions |
| `tailwindcss` | `^4.0.0` | Utility CSS — v4 CSS-native config (see §1.2 config notes) |
| `@tailwindcss/vite` | `^4.0.0` | Vite integration plugin for Tailwind v4 |

> **Tailwind v4 note:** v4 uses a CSS-first configuration. The `tailwind.config.js` is replaced by
> directives in `src/styles/globals.css`. Custom tokens are defined via `@theme` block (see §1.2).

#### Backend (`requirements.txt` — all versions pinned)

| Package | Version | Notes |
|---------|---------|-------|
| `Python` | `3.14+` | Install via `pyenv`; activate before creating venv |
| `Django` | `>=6.0` | Use LTS release if 6.x available; else latest stable 5.x |
| `djangorestframework` | `>=3.15` | Core API framework |
| `djangorestframework-simplejwt` | `>=5.4` | JWT auth + blacklist |
| `django-cors-headers` | `>=4.4` | CORS middleware |
| `Pillow` | `>=11.0` | Image processing |
| `django-filter` | `>=24.3` | FilterSet support |
| `drf-spectacular` | `>=0.28` | OpenAPI schema generation |
| `celery` | `>=5.4` | Background task queue |
| `redis` | `>=5.2` | Python Redis client |
| `django-storages` | `>=1.14` | S3/cloud storage backend |
| `python-decouple` | `>=3.8` | `.env` variable loading |
| `python-magic` | `>=0.4.27` | Server-side MIME validation |
| `psycopg2-binary` | `>=2.9` | PostgreSQL adapter |
| `celery[redis]` | `>=5.4` | Redis as broker + result backend |

#### Database & Infrastructure

| Component | Version | Notes |
|-----------|---------|-------|
| PostgreSQL | `18+` | Required for `SearchVectorField` (full-text search) + GinIndex |
| Redis | `7+` | Celery broker, result backend, and recommendation cache |

**Dev Tools:** Git, GitHub, VS Code / any editor
**All Python packages must be installed inside a virtual environment named `pccraft`**
(`python -m venv pccraft` → `source pccraft/bin/activate`)
**All versions must be recorded in `requirements.txt` with pinned versions.**

---

### 2.2 System Architecture

```
[React Frontend :5173]
     │  Axios + Bearer JWT headers
     ▼
[Django REST API :8000]  ←→  [Redis :6379]
     │                           │
     │  psycopg2                 │  Celery broker + result backend
     ▼                           ▼
[PostgreSQL :5432]       [Celery Workers]
                         (email sends, recommendation cache refresh)
```

Frontend and backend are **fully decoupled**. All communication is via REST API only.
No Django templates are used for the frontend (templates folder is for email HTML only).

---

### 2.3 User Roles & Authentication

#### Role Selection at Login

The login page must show a **role selector** before the credential form appears:

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   👤 Customer   │  │   🏪 Vendor     │  │   🛡️ Admin      │
│                 │  │                 │  │                 │
│ Browse & Shop   │  │ Sell Products   │  │ Manage Platform │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

- Selecting a role stores the expected role in component state (not Zustand)
- After login API call, JWT is decoded client-side to extract `user.role`
- If `decoded.role !== selectedRole` → clear tokens + show toast:
  `"This account is not registered as a [role]. Please select the correct role."`
- On success, update Zustand `useAuthStore` and redirect:
  - Customer → `/`
  - Vendor → `/vendor/dashboard`
  - Admin → `/admin/dashboard`

#### Registration Flows

**Customer Registration Fields:**
- Full Name (required, min 3 chars)
- Email (required, unique, valid format)
- Phone Number (required, regex: `^\+880[0-9]{10}$`)
- Password (required, min 8 chars, must contain uppercase + number)
- Confirm Password (must match)
- Date of Birth (optional, date picker, must be ≥ 13 years old if provided)
- Gender (optional, select: Male / Female / Prefer not to say)
- Accept Terms & Conditions (required checkbox — form disabled until checked)

**Vendor Registration Fields (4-step form):**

*Step 1 — Personal Info:*
- Owner Full Name, Email, Phone Number, Password, Confirm Password

*Step 2 — Business Info:*
- Business Name, Business Type (Sole Proprietorship / Partnership / Private Limited / Other)
- Business Phone (optional), Trade License Number
- Business Address: Street, City, District, Postal Code

*Step 3 — Document Upload:*
- Trade License Document (PDF or image, max 5MB — validated server-side by MIME type)
- NID / Passport Number, NID / Passport Document (PDF or image, max 5MB)

*Step 4 — Review & Submit:*
- Summary of all entered data (read-only), Accept Vendor Terms checkbox, Submit button

**Vendor Approval Workflow:**
1. Submit → status = `PENDING` → Admin gets in-platform notification
2. Admin reviews documents in `AdminVendorApprovalPage`
3. Admin actions:
   - **Approve** → `APPROVED` → vendor notified, store features unlocked
   - **Reject** → `REJECTED` → vendor notified with mandatory rejection reason
   - **Request Info** → `INFO_REQUESTED` → vendor can resubmit documents
4. Vendor logged in with `PENDING`/`REJECTED` status sees a status-aware banner, cannot
   access vendor features (enforced by `IsApprovedVendor` permission on all vendor endpoints)

---

### 2.4 Customer Capabilities

- Register / Login / Logout
- Update profile (avatar upload, name, phone, DOB, gender)
- Manage multiple shipping addresses (set/change default)
- Browse shop with filters, search, sorting, pagination
- View product detail page (image gallery, specs table, reviews, recommendations)
- Add to cart / update quantities / remove / clear
- Wishlist (add/remove, move item to cart)
- Checkout (address → review → payment → confirmation)
- View order history with live status
- Submit product review (rating + title + body + up to 4 images) — **only if they have at least one DELIVERED order containing that product**
- Edit / delete own reviews (title, body, images — rating is immutable after submission)
- React to vendor replies on their own reviews
- Initiate return request (within 7-day window of delivery)
- Track return request status
- View personalized and trending recommendation feeds
- Use PC Builder and Compatibility Checker

---

### 2.5 Vendor Capabilities

- Register → await `APPROVED` status before any store access
- Edit store profile: name, logo, banner, description, contact email, custom return policy
- Create products with full category-specific specs, up to 8 images
- Edit / delete / archive own products
- Drag-and-drop image reorder with primary image selection
- View incoming orders (only their own order items)
- Update order item status: `CONFIRMED → PROCESSING → SHIPPED → DELIVERED`
- Respond to customer reviews on their products (one reply per review; reply is editable but not deletable; reply appears publicly under the review)
- View all reviews for their products in a dedicated `VendorReviewsPage` (filterable by rating, date, replied/unreplied status)
- View return requests for their products; approve/reject with reason, mark received
- View vendor dashboard: earnings, order counts, top products, inventory alerts
- Configure low-stock alert threshold per product

---

### 2.6 Admin Capabilities

- Full user management: view, search, suspend/activate/delete (soft delete) customers + vendors
- Vendor approval queue with inline document preview (PDF viewer or image lightbox)
- Product moderation: hide / restore / hard-delete any product
- CRUD: Categories (tree structure), Brands
- CRUD: Compatibility Rules and Attributes
- Full order visibility with status filter and order detail view
- Return/refund management: process refunds, add admin notes
- Review moderation: hide / restore reviews; remove vendor replies that violate policies; filter by hidden status, rating, date, product, and vendor
- System analytics dashboard:
  - KPI cards: total revenue, total orders, total users, total vendors
  - Line chart: revenue over time (7d / 30d / 90d selector)
  - Bar chart: orders by status
  - Pie chart: category distribution
  - Top 10 products table
  - Top 10 vendors table

---

### 2.7 Product System

#### Categories
CPU, GPU, Motherboard, RAM, SSD, HDD, Power Supply, CPU Cooler, PC Case, Monitor, Laptop,
Keyboard, Mouse, Headset, Webcam, UPS, Networking, Accessories

#### Product Model Core Fields

| Field                  | Type                               | Notes                                |
|------------------------|------------------------------------|--------------------------------------|
| `name`                 | CharField(200)                     |                                      |
| `slug`                 | SlugField(unique=True)             | Auto-generated on save               |
| `brand`                | FK → Brand                         |                                      |
| `category`             | FK → Category                      |                                      |
| `vendor`               | FK → VendorProfile                 |                                      |
| `description`          | TextField                          | Markdown stored as plain text        |
| `short_description`    | CharField(500)                     |                                      |
| `base_price`           | DecimalField(12,2)                 |                                      |
| `discounted_price`     | DecimalField(12,2) nullable        |                                      |
| `discount_start`       | DateTimeField nullable             |                                      |
| `discount_end`         | DateTimeField nullable             |                                      |
| `sku`                  | CharField unique per vendor        |                                      |
| `stock_quantity`       | PositiveIntegerField               |                                      |
| `low_stock_threshold`  | PositiveIntegerField default=5     | Vendor-configurable                  |
| `status`               | TextChoices: DRAFT/ACTIVE/PAUSED/ARCHIVED/HIDDEN |                             |
| `weight_kg`            | DecimalField(6,2) nullable         | For future shipping                  |
| `dimensions_cm`        | JSONField nullable                 | `{l, w, h}`                          |
| `warranty_months`      | PositiveSmallIntegerField          |                                      |
| `is_featured`          | BooleanField default=False         | Admin-set only                       |
| `specs`                | JSONField default=dict             | Category-specific key-value specs    |

#### Category-Specific Specs (stored in `specs` JSONField)

This is the **canonical spec schema** for every category. Claude Code must use **exactly these key
names** in models, seed data, serializer validation, `ProductSpecsTable.jsx`, and
`CompatibilityService`. Any deviation will break the compatibility checker.

**Key naming rules:** snake_case, lowercase. JSON arrays stored as Python `list` (serialized
as JSON array). Booleans stored as Python `bool`. All numeric values stored as `int` or `float`
(never string).

---

##### CPU

| Key | Type | Example | Used By |
|-----|------|---------|---------|
| `socket` | `str` | `"LGA1851"` | R-01 (MOBO match), R-08 (COOLER match) |
| `cores` | `int` | `24` | Display only |
| `threads` | `int` | `32` | Display only |
| `base_clock_ghz` | `float` | `3.2` | Display only |
| `boost_clock_ghz` | `float` | `5.8` | Display only |
| `tdp_w` | `int` | `125` | R-04 (POWER_CHECK sum), R-10 (COOLER RANGE_MAX) |
| `architecture` | `str` | `"Raptor Lake Refresh"` | Display only |
| `igpu` | `bool` | `true` | Display only |

##### GPU

| Key | Type | Example | Used By |
|-----|------|---------|---------|
| `vram_gb` | `int` | `24` | Display only |
| `memory_type` | `str` | `"GDDR6X"` | Display only |
| `tdp_w` | `int` | `320` | R-04 (POWER_CHECK sum) |
| `length_mm` | `int` | `336` | R-06 (CASE RANGE_MAX) |
| `power_connectors` | `str` | `"2x 8-pin"` | Display only |
| `slot_width` | `int` | `2` | Display only (PCIe slots occupied) |

##### Motherboard

| Key | Type | Example | Used By |
|-----|------|---------|---------|
| `socket` | `str` | `"LGA1851"` | R-01 (CPU MATCH) |
| `chipset` | `str` | `"Z790"` | Display only |
| `form_factor` | `str` | `"ATX"` | R-05 (CASE MEMBER_OF) |
| `ram_slots` | `int` | `4` | Display only |
| `ram_type` | `list[str]` | `["DDR5"]` | R-02 (RAM MEMBER_OF) |
| `max_ram_gb` | `int` | `192` | R-09 (RAM RANGE_MAX) |
| `max_ram_speed_mhz` | `int` | `7200` | R-03 (RAM RANGE_MAX) |
| `pcie_slots` | `int` | `3` | Display only |
| `m2_slots` | `int` | `4` | Display only |

##### RAM

| Key | Type | Example | Used By |
|-----|------|---------|---------|
| `capacity_gb` | `int` | `32` | R-09 (sum × slots vs MOBO max) |
| `speed_mhz` | `int` | `6400` | R-03 (MOBO RANGE_MAX) |
| `type` | `str` | `"DDR5"` | R-02 (MOBO MEMBER_OF) |
| `form_factor` | `str` | `"DIMM"` | Display only |
| `cas_latency` | `str` | `"CL32"` | Display only |

##### SSD

| Key | Type | Example | Used By |
|-----|------|---------|---------|
| `capacity_gb` | `int` | `2000` | Display only |
| `interface` | `str` | `"NVMe PCIe 4.0"` | Display only |
| `form_factor` | `str` | `"M.2 2280"` | Display only |
| `read_mbps` | `int` | `7300` | Display only |
| `write_mbps` | `int` | `6800` | Display only |

##### HDD

| Key | Type | Example | Used By |
|-----|------|---------|---------|
| `capacity_gb` | `int` | `4000` | Display only |
| `rpm` | `int` | `7200` | Display only |
| `interface` | `str` | `"SATA III"` | Display only |
| `cache_mb` | `int` | `256` | Display only |

##### Power Supply (PSU)

| Key | Type | Example | Used By |
|-----|------|---------|---------|
| `wattage` | `int` | `850` | R-04 (POWER_CHECK ceiling) |
| `efficiency_rating` | `str` | `"80+ Gold"` | Display only |
| `modular` | `str` | `"Full"` | Display only (`"Full"` / `"Semi"` / `"Non-modular"`) |

##### CPU Cooler

| Key | Type | Example | Used By |
|-----|------|---------|---------|
| `socket_support` | `list[str]` | `["LGA1851","LGA1700","AM5"]` | R-08 (CPU MEMBER_OF) |
| `tdp_rating_w` | `int` | `250` | R-10 (CPU RANGE_MAX) |
| `cooler_type` | `str` | `"AIO"` | Display only (`"AIO"` / `"Air"`) |
| `fan_size_mm` | `int` | `120` | Display only |
| `height_mm` | `int` | `158` | R-07 (CASE RANGE_MAX) |

##### PC Case

| Key | Type | Example | Used By |
|-----|------|---------|---------|
| `form_factors_supported` | `list[str]` | `["ATX","mATX","ITX"]` | R-05 (MOBO MEMBER_OF) |
| `max_gpu_length_mm` | `int` | `410` | R-06 (GPU RANGE_MAX) |
| `max_cooler_height_mm` | `int` | `170` | R-07 (COOLER RANGE_MAX) |
| `drive_bays` | `dict` | `{"3_5_inch": 2, "2_5_inch": 4}` | Display only |

##### Monitor

| Key | Type | Example |
|-----|------|---------|
| `size_inch` | `float` | `27.0` |
| `resolution` | `str` | `"2560x1440"` |
| `panel_type` | `str` | `"IPS"` |
| `refresh_rate_hz` | `int` | `165` |
| `response_time_ms` | `float` | `1.0` |
| `ports` | `list[str]` | `["HDMI 2.1","DisplayPort 1.4"]` |

##### Laptop

| Key | Type | Example |
|-----|------|---------|
| `cpu` | `str` | `"Intel Core i7-13700H"` |
| `gpu` | `str` | `"NVIDIA RTX 4060"` |
| `ram_gb` | `int` | `16` |
| `storage_gb` | `int` | `512` |
| `display_size_inch` | `float` | `15.6` |
| `resolution` | `str` | `"1920x1080"` |
| `battery_wh` | `int` | `86` |

##### Keyboard

| Key | Type | Example |
|-----|------|---------|
| `layout` | `str` | `"TKL"` (`"Full-size"` / `"TKL"` / `"75%"` / `"65%"` / `"60%"`) |
| `switch_type` | `str` | `"Cherry MX Red"` / `"Membrane"` |
| `connectivity` | `str` | `"Wired"` / `"Wireless"` / `"Both"` |
| `backlit` | `bool` | `true` |

##### Mouse

| Key | Type | Example |
|-----|------|---------|
| `dpi_max` | `int` | `25600` |
| `connectivity` | `str` | `"Wired"` / `"Wireless"` |
| `buttons` | `int` | `6` |
| `sensor` | `str` | `"Optical"` / `"Laser"` |

##### Headset

| Key | Type | Example |
|-----|------|---------|
| `connectivity` | `str` | `"USB"` / `"3.5mm"` / `"Wireless"` |
| `driver_mm` | `int` | `50` |
| `frequency_hz` | `str` | `"20-20000"` |
| `microphone` | `bool` | `true` |
| `surround_sound` | `str` | `"7.1 Virtual"` / `"Stereo"` |

##### Webcam

| Key | Type | Example |
|-----|------|---------|
| `resolution` | `str` | `"1080p"` / `"4K"` |
| `fps` | `int` | `30` |
| `connectivity` | `str` | `"USB-A"` / `"USB-C"` |
| `field_of_view` | `int` | `90` |

##### UPS

| Key | Type | Example |
|-----|------|---------|
| `capacity_va` | `int` | `1000` |
| `capacity_watt` | `int` | `600` |
| `battery_backup_min` | `int` | `20` |
| `outlets` | `int` | `4` |

##### Networking

| Key | Type | Example |
|-----|------|---------|
| `type` | `str` | `"WiFi Router"` / `"Switch"` / `"Ethernet Card"` |
| `speed_mbps` | `int` | `1000` |
| `wifi_standard` | `str` (nullable) | `"Wi-Fi 6E"` |
| `ports` | `int` | `4` |

##### Accessories

| Key | Type | Example |
|-----|------|---------|
| `type` | `str` | `"Cable"` / `"Adapter"` / `"Mount"` / `"Other"` |
| `compatibility` | `list[str]` | `["Universal"]` |

---

### 2.8 Return & Refund Policy System

**Platform Default Policy (used unless vendor overrides):**
- Return window: **7 days** from `OrderItem.delivered_at`
- Eligible reasons (stored as `TextChoices` enum):
  - `DAMAGED` — Item received damaged
  - `NOT_AS_DESCRIBED` — Item not as described
  - `WRONG_ITEM` — Wrong item delivered
  - `DEFECTIVE` — Defective / Dead on Arrival
  - `MISSING_PARTS` — Missing parts or accessories
- Non-returnable: used items, activated software keys, opened consumables
- Refund: credited to original payment method within 7–10 business days

**Return Request Status Flow:**
```
PENDING → APPROVED → SHIPPED_BACK → RECEIVED → REFUND_INITIATED → REFUNDED
                 ↘ REJECTED
```

Each status transition must record a `[status]_at` timestamp on the `ReturnRequest` model.

---

### 2.9 Recommendation System

Strategy-pattern architecture — each algorithm is a swappable class implementing a common
abstract interface. Heavy strategies are precomputed by Celery and served from Redis.

#### Architecture

```
RecommendationStrategy (ABC)           ← engine.py
├── ContentBasedStrategy               → "Similar Products"
├── CoOccurrenceStrategy               → "Frequently Bought Together"
├── RecentlyViewedStrategy             → "Recently Viewed"
├── PersonalizedStrategy               → "Recommended For You"
├── TrendingStrategy                   → "Trending Now" (global + per-category)
└── CompatibilityStrategy              → PC Builder slot suggestions (Module 8)

RecommendationMixer                    → blends N strategies with weights, deduplicates
```

#### Strategy Surface Map

| Strategy | Context Input | Surface | Cache Key | TTL |
|----------|--------------|---------|-----------|-----|
| `ContentBasedStrategy` | `{product_id}` | Product detail page | `rec:similar:{product_id}` | 6 h |
| `CoOccurrenceStrategy` | `{product_id}` | Product detail + Cart | `rec:co_occur:{product_id}` | 12 h |
| `RecentlyViewedStrategy` | `{user_id}` or `{session_key}` | Homepage sidebar | None (live DB) | — |
| `PersonalizedStrategy` | `{user_id}` | Homepage feed | `rec:personal:{user_id}` | 24 h |
| `TrendingStrategy` | `{}` or `{category_id}` | Homepage + Category pages | `rec:trending:global` / `rec:trending:cat:{id}` | 1 h |

#### Algorithm Specifications

**`ContentBasedStrategy`**
```
Input:  context = {product_id}
Output: ordered list of product IDs (max `limit`)

Steps:
  1. Load target product → category, specs (JSONField dict), effective_price
  2. Fetch all ACTIVE products in same category (exclude self), with specs prefetched
  3. For each candidate product:
       spec_score = (number of matching key-value pairs between target.specs and candidate.specs)
                  / max(len(target.specs), 1)         ← normalised 0.0–1.0
  4. Price proximity filter: keep only candidates where
       0.5 × target.effective_price ≤ candidate.effective_price ≤ 2.0 × target.effective_price
  5. Sort: spec_score DESC → avg_rating DESC → created_at DESC
  6. Return top `limit` IDs
```

**`CoOccurrenceStrategy`**
```
Input:  context = {product_id}
Output: ordered list of product IDs (max `limit`)

Steps:
  1. Find all OrderItem rows with product_id = context.product_id
     AND order.status in [DELIVERED, SHIPPED, OUT_FOR_DELIVERY]
  2. Collect distinct order IDs
  3. From those orders, count all other product_id occurrences (exclude input product)
     → co_occurrence_count per product
  4. Sort by co_occurrence_count DESC
  5. Return top `limit` IDs

Cache: precomputed nightly → stored as JSON list in Redis rec:co_occur:{product_id}
```

**`RecentlyViewedStrategy`**
```
Input:  context = {user_id} for authenticated  OR  {session_key} for anonymous
Output: ordered list of product IDs, most recent first

Steps:
  1. Query ProductView WHERE (user_id = … OR session_key = …)
     ORDER BY viewed_at DESC
  2. Deduplicate: keep only the latest ProductView per product_id
  3. Slice to last 20 unique products
  4. Return product IDs in recency order (newest first)

No Redis cache — served directly from ProductView table.
Anonymous session_key stored in client localStorage as 'pccraft_session'.
Sent via X-Session-Key request header on all API calls.
```

**`PersonalizedStrategy`**
```
Input:  context = {user_id}
Output: ordered list of product IDs (max `limit`)

Cold-start rule: if user has fewer than 3 distinct purchased or viewed products
  → fall back to TrendingStrategy (no personalization possible yet)

Steps:
  1. Build user_vector: set of product IDs the user has purchased OR viewed
  2. Find neighbor users: CustomUser records who share ≥ 2 product IDs with user
     (via OrderItem INNER JOIN on product_id ∩ user_vector)
  3. Collect all product IDs purchased by neighbor users
     that are NOT in user_vector (unseen by target user)
  4. Score each unseen product by neighbor_overlap_count
     (how many neighbors also bought it)
  5. Sort: neighbor_overlap_count DESC → avg_rating DESC
  6. Return top `limit` IDs

Cache: precomputed nightly per user → stored as JSON list in rec:personal:{user_id}
```

**`TrendingStrategy`**
```
Input:  context = {} for global  OR  {category_id} for scoped trending
Output: ordered list of product IDs (max `limit`)

Window: last 7 days (from now - 7 days to now)

Steps:
  1. Aggregate OrderItem: purchase_count per product_id in window
     (filter order.status != CANCELLED)
  2. Aggregate ProductView: view_count per product_id in window
  3. score = (purchase_count × 0.6) + (view_count × 0.4)
  4. If category_id provided: filter to products in that category
  5. Exclude products with stock_quantity = 0
  6. Sort by score DESC
  7. Return top `limit` IDs

Cache: rec:trending:global or rec:trending:cat:{category_id}  TTL=1h
```

#### `RecommendationMixer`

```python
class RecommendationMixer:
    def __init__(self, strategies: list[tuple[RecommendationStrategy, float]]):
        self.strategies = strategies  # [(strategy, weight), ...]

    def get_mixed(self, context: dict, limit: int) -> list[int]:
        """
        For each strategy, fetch up to limit*2 IDs.
        Assign score[product_id] += weight * (fetch_limit - position)
        Merge, deduplicate, sort by composite score DESC.
        Return top `limit` IDs.
        """
```

#### `ProductView` Model

| Field | Type | Notes |
|-------|------|-------|
| `user` | FK CustomUser, null=True | null for anonymous |
| `product` | FK Product | |
| `viewed_at` | DateTimeField(auto_now_add) | |
| `session_key` | CharField(64, blank=True) | anonymous tracking |

Constraints & behavior:
- If same `(user, product)` or `(session_key, product)` viewed within **30 minutes**: update
  `viewed_at` in place — do NOT insert a new record (prevents spam)
- Database indexes: `(product, viewed_at)` for trending; `(user, viewed_at)` for personalized
- Retention policy: Celery task purges records older than **90 days** every Sunday at 03:00

#### Redis Key Schema

| Key | Value | TTL |
|-----|-------|-----|
| `rec:similar:{product_id}` | JSON `[id, id, ...]` | 6 h |
| `rec:co_occur:{product_id}` | JSON `[id, id, ...]` | 12 h |
| `rec:personal:{user_id}` | JSON `[id, id, ...]` | 24 h |
| `rec:trending:global` | JSON `[id, id, ...]` | 1 h |
| `rec:trending:cat:{category_id}` | JSON `[id, id, ...]` | 1 h |
| `product:avg_rating:{product_id}` | Float string or `"null"` | Invalidated on review create/edit/hide |

Redis fallback: if Redis is unavailable, all strategies fall back to direct DB computation
(no caching). Log a WARNING but do not raise a 500 error.

#### Celery Task Schedule

| Task | Schedule | Description |
|------|----------|-------------|
| `refresh_trending_cache` | Every hour | Recomputes global + per-category trending for all active categories |
| `refresh_co_occurrence_cache` | Every 12 hours | Recomputes co-occurrence for top 500 products by order volume |
| `refresh_personalized_cache(user_id)` | Dispatched per user | Personalized recs for one user |
| `refresh_all_personalized` | Daily at 02:00 | Iterates all active users, dispatches `refresh_personalized_cache` |
| `purge_old_product_views` | Weekly Sun 03:00 | Deletes `ProductView` records older than 90 days |

#### Placement Map

```
HomePage.jsx:
  "Trending Now"          → TrendingStrategy (global)         public
  "Recommended For You"   → PersonalizedStrategy              IsAuthenticated (hidden if not authed)
  "Recently Viewed"       → RecentlyViewedStrategy            IsAuthenticated (hidden if not authed)

CategoryPage.jsx:
  "Trending in [Category]" → TrendingStrategy (category_id)  public

ProductDetailPage.jsx:
  "Similar Products"              → ContentBasedStrategy
  "Frequently Bought Together"    → CoOccurrenceStrategy

CartPage.jsx + CartDrawer.jsx:
  "You Might Also Need"           → TrendingStrategy (global, fallback for non-authed)

OrderConfirmPage.jsx:
  "Other Customers Also Bought"   → TrendingStrategy (global)
```

#### View Tracking

`POST /api/v1/products/{slug}/track-view/` — public endpoint, no auth required.
- Creates or updates `ProductView` record (30-minute dedup window)
- Reads `X-Session-Key` header for anonymous users
- Called on mount in `ProductDetailPage` with 500ms debounce to avoid duplicate calls on StrictMode double-render

---

### 2.10 Compatibility Checker & PC Builder

All compatibility logic is stored in the database as `CompatibilityRule` records.
Zero hardcoded conditions exist in application code — the rule engine is fully data-driven.

#### PC Builder Slots

| Slot Key | Label | Category | Required for Completion |
|----------|-------|----------|------------------------|
| `CPU` | Processor | CPU | ✅ |
| `MOBO` | Motherboard | Motherboard | ✅ |
| `RAM_1` | Memory (Slot 1) | RAM | ✅ |
| `RAM_2` | Memory (Slot 2) | RAM | ❌ optional |
| `GPU` | Graphics Card | GPU | ❌ optional (may use CPU iGPU) |
| `PSU` | Power Supply | Power Supply | ✅ |
| `CASE` | PC Case | PC Case | ✅ |
| `COOLER` | CPU Cooler | CPU Cooler | ❌ optional (boxed cooler implied) |
| `SSD_1` | Storage (SSD 1) | SSD | ❌ optional |
| `SSD_2` | Storage (SSD 2) | SSD | ❌ optional |
| `HDD` | Storage (HDD) | HDD | ❌ optional |

A build is marked `COMPLETE` only when all required slots are filled and there are zero ERROR results.

#### Compatibility Rules (seeded as `CompatibilityRule` records)

| Rule ID | Rule Name | Slot A | Attribute A | Slot B | Attribute B | Rule Type | Severity |
|---------|-----------|--------|-------------|--------|-------------|-----------|----------|
| R-01 | CPU ↔ Motherboard Socket | CPU | `socket` | MOBO | `socket` | `MATCH` | ERROR |
| R-02 | RAM Type ↔ Motherboard | RAM | `type` | MOBO | `ram_type` | `MEMBER_OF` | ERROR |
| R-03 | RAM Speed ↔ Motherboard Max | RAM | `speed_mhz` | MOBO | `max_ram_speed_mhz` | `RANGE_MAX` | WARNING |
| R-04 | GPU + CPU Power ↔ PSU | GPU+CPU | `tdp_w` (sum) | PSU | `wattage` | `POWER_CHECK` | ERROR |
| R-05 | Motherboard Form Factor ↔ Case | MOBO | `form_factor` | CASE | `form_factors_supported` | `MEMBER_OF` | ERROR |
| R-06 | GPU Length ↔ Case Max GPU Length | GPU | `length_mm` | CASE | `max_gpu_length_mm` | `RANGE_MAX` | ERROR |
| R-07 | Cooler Height ↔ Case Clearance | COOLER | `height_mm` | CASE | `max_cooler_height_mm` | `RANGE_MAX` | ERROR |
| R-08 | Cooler Socket ↔ CPU Socket | CPU | `socket` | COOLER | `socket_support` | `MEMBER_OF` | ERROR |
| R-09 | RAM Capacity Total ↔ Motherboard Max | RAM (× slots) | `capacity_gb` | MOBO | `max_ram_gb` | `RANGE_MAX` | WARNING |
| R-10 | CPU TDP ↔ Cooler TDP Rating | CPU | `tdp_w` | COOLER | `tdp_rating_w` | `RANGE_MAX` | WARNING |

#### Rule Type Evaluation Logic

| Rule Type | Evaluation | Example |
|-----------|------------|---------|
| `MATCH` | `spec_a == spec_b` (string equality) | CPU socket `LGA1700` == MOBO socket `LGA1700` |
| `MEMBER_OF` | `spec_a in spec_b_json_array` | RAM `type = "DDR5"` in MOBO `ram_type = ["DDR4","DDR5"]` |
| `RANGE_MAX` | `numeric(spec_a) ≤ numeric(spec_b)` | GPU length `310` ≤ case `max_gpu_length_mm = 350` |
| `POWER_CHECK` | `(cpu.tdp_w + gpu.tdp_w + system_overhead) ≤ psu.wattage × 0.80` | sum TDPs + 50W ≤ PSU × 80% |

`system_overhead` for POWER_CHECK: `50W` base + `5W × RAM_slot_count` + `5W × SSD_count` + `10W × HDD_count`

#### CompatibilityResult Severity

| Severity | Icon | UI Color | Meaning | Default state in accordion |
|----------|------|----------|---------|---------------------------|
| `ERROR` | ✗ | `danger` red | Definitively incompatible — build will not function | Expanded |
| `WARNING` | ⚠ | `warning` yellow | Suboptimal or borderline — may work but not recommended | Expanded |
| `OK` | ✓ | `success` green | Check passed | Collapsed |
| `INFO` | ○ | `text-secondary` grey | Relevant component(s) not yet selected | Collapsed |

A rule produces `INFO` (not `ERROR`) when either required slot is empty.
`ERROR` is only raised when both slots are filled and the check fails.

#### Wattage Display Logic

```
estimated_tdp = cpu.tdp_w (if CPU selected, else 0)
              + gpu.tdp_w (if GPU selected, else 0)
              + (filled_ram_slots × 5)
              + (filled_ssd_slots × 5)
              + (1 if HDD selected else 0) × 10
              + 50  ← fixed system overhead (chipset, fans, drives, USB)

psu_headroom = psu.wattage × 0.80  (if PSU selected, else null)

Display:
  No PSU selected   → "Estimated Load: {estimated_tdp} W  (Select a PSU to check headroom)"
  Load ≤ headroom × 0.70  → green  "Estimated Load: {X} W / {psu.wattage} W  ✓ Good headroom"
  Load ≤ headroom         → yellow "Estimated Load: {X} W / {psu.wattage} W  ⚠ Near limit"
  Load > headroom         → red    "Estimated Load: {X} W / {psu.wattage} W  ✗ Underpowered"
```

#### Compatible Product Filtering

`GET /api/v1/compatibility/products/{slot}/` + current build as query params:
```
?cpu_id=123&mobo_id=456&gpu_id=789&psu_id=101&case_id=112&...
```
Backend logic in `CompatibilityService.get_compatible_products(slot, build_dict, page, search)`:
1. Determine this slot's category
2. Find all `is_active=True` rules that reference this category (as either `category_a` or `category_b`)
3. For each rule, check which other slot it references and whether that slot is filled in `build_dict`
4. If the partner slot is filled: apply the rule as a queryset filter:
   - `MATCH`: `product.specs__socket = partner.specs.socket`
   - `MEMBER_OF`: `partner.specs.socket IN product.specs.socket_support` (for array fields, use `__contains` on JSONField)
   - `RANGE_MAX`: `product.specs__height_mm__lte = partner.specs.max_cooler_height_mm`
   - `POWER_CHECK`: compute min PSU wattage from current TDP sum → filter `specs__wattage__gte = min_wattage`
5. If partner slot is empty: skip that rule's filter (no constraint yet)
6. Apply `search` filter on product `name` and `brand.name`
7. Return paginated `ProductListSerializer` — shows only compatible products

#### Build Persistence

- **Anonymous builds**: full build state stored in `localStorage` under key `pccraft_build`
  as `{ slots: { CPU: product_id, MOBO: product_id, ... }, name: "My Build" }`
  On login: auto-POST to `POST /api/v1/builds/` to create a DB-persisted record, then
  redirect user back to the builder with the new build ID
- **Authenticated builds**: DB-persisted `PCBuild` records; multiple saved builds per user (no cap)
- **Share URL**: `GET /api/v1/builds/share/{share_token}/` — public, read-only; returns full build
  with all selected products and the latest compatibility report

#### `CompatibilityService.check_build(build_id)` Algorithm

> **`CompatibilityResult`** is a Python dataclass (not a DB model) defined in
> `apps/compatibility/services.py`. It is used throughout the algorithm below.
> Full definition is in Module 8 backend tasks, but summarised here for reference:
> ```python
> from dataclasses import dataclass
> @dataclass
> class CompatibilityResult:
>     rule_name: str
>     status: str        # 'OK' | 'WARNING' | 'ERROR' | 'INFO'
>     message: str
>     category_a: str = ''
>     category_b: str = ''
> ```

```python
def check_build(build_id: int) -> list[CompatibilityResult]:
    build = PCBuild.objects.prefetch_related('items__product').get(pk=build_id)
    slot_map = {item.slot: item.product for item in build.items.all() if item.product}

    results = []
    for rule in CompatibilityRule.objects.filter(is_active=True).select_related(
        'category_a', 'category_b', 'attribute_a', 'attribute_b'
    ):
        product_a = _find_product_for_category(slot_map, rule.category_a)
        product_b = _find_product_for_category(slot_map, rule.category_b)

        if product_a is None or product_b is None:
            results.append(CompatibilityResult(
                rule_name=rule.rule_name, status='INFO',
                message=f"Select {rule.category_a} and {rule.category_b} to check this rule."
            ))
            continue

        passed, message = _evaluate_rule(rule, product_a, product_b, slot_map)
        status = 'OK' if passed else ('WARNING' if rule.severity == 'WARNING' else 'ERROR')
        results.append(CompatibilityResult(rule_name=rule.rule_name, status=status, message=message,
                                           category_a=rule.category_a.name,
                                           category_b=rule.category_b.name))

    # Compute wattage
    wattage_summary = _compute_wattage(slot_map)
    results.append(wattage_summary)

    return results
```

---

### 2.11 Order System

**Order Status Flow:**
```
PENDING_PAYMENT → CONFIRMED → PROCESSING → SHIPPED → OUT_FOR_DELIVERY → DELIVERED
                                                                       ↘ CANCELLED
                                                                       ↘ RETURN_REQUESTED → RETURNED
```

**Order Item Status (vendor-controlled):**
```
CONFIRMED → PROCESSING → SHIPPED → DELIVERED
```

**Critical Design Decisions:**
- `OrderItem.unit_price` is set at creation from `Product.effective_price` — **never updated**
- `OrderItem.discount_snapshot` records exact discount applied at purchase time
- `shipping_address_snapshot` (JSONField) copies the address at order time — FK is not used
- `order_number` format: `PCM-YYYYMMDD-NNNNN` (5-digit zero-padded sequence per day)
- Each `OrderItem` also stores `product_name_snapshot` (product name at purchase time)

---

### 2.12 API Design Standards

**Response Envelope (all endpoints):**
```json
{
  "status": "success" | "error",
  "data": { ... } | null,
  "message": "Human-readable message",
  "errors": { "field": ["error"] } | null
}
```

**Pagination Envelope:**
```json
{
  "count": 150,
  "next": "http://localhost:8000/api/v1/products/?page=3",
  "previous": "http://localhost:8000/api/v1/products/?page=1",
  "results": [ ... ]
}
```

**Standards:**
- All endpoints versioned under `/api/v1/`
- Auth: `Authorization: Bearer <access_token>` header
- Token refresh: `POST /api/v1/auth/token/refresh/`
- 401 on expired access → Axios interceptor auto-refreshes, retries once
- OpenAPI schema: `/api/schema/` · Swagger UI: `/api/docs/` · ReDoc: `/api/redoc/`

---

### 2.13 Security Requirements

- JWT access token TTL: **15 minutes**; refresh token TTL: **7 days**
- Refresh token rotation enabled (`ROTATE_REFRESH_TOKENS = True`, `BLACKLIST_AFTER_ROTATION = True`)
- Passwords: Django's PBKDF2-SHA256 (default) — no custom hashing
- File uploads: validate MIME type server-side in `apps/common/validators.py` using `python-magic`
  (not just extension checking)
- Allowed upload MIME types: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`
- Max upload size: 5MB enforced in DRF settings and per-serializer validation
- Role-permission matrix enforced by custom DRF permission classes on every endpoint:
  - Public: product list/detail, category list, brand list, search
  - Customer only: cart, wishlist, checkout, order history, reviews, returns
  - Vendor only (+ `IsApprovedVendor`): vendor products, vendor orders, vendor dashboard
  - Admin only: admin analytics, user management, vendor approval, product moderation
- CORS: `CORS_ALLOWED_ORIGINS = ["http://localhost:5173"]` in development
- Vendors can only read/write their own products, orders, and returns
- Customers can only read/write their own orders, reviews, and return requests

---

### 2.14 Database Design Principles

- Minimum 3NF across all models
- Every model inherits `TimeStampedModel` (provides `created_at`, `updated_at` with `auto_now`)
- Soft delete on Users, Products, Orders: `is_deleted` (BooleanField) + `deleted_at` (DateTimeField)
- All soft-deleted records must be excluded by a custom `ActiveManager` (default manager)
- `OrderItem.unit_price` is never updated post-creation (add a database-level constraint comment)
- `CompatibilityRule` records drive all compatibility logic — zero hardcoded conditions
- Database indexes on:
  - All ForeignKey fields (Django adds automatically)
  - `slug` fields: `db_index=True`
  - `status` fields on `Product`, `Order`, `ReturnRequest`, `VendorProfile`
  - `created_at` on `Order`, `Review`, `ReturnRequest`
  - `(user, product)` composite unique constraint on `Review`
  - `(product, viewed_at)` on `ProductView` — trending score aggregation
  - `(user, viewed_at)` on `ProductView` — recently-viewed + personalized
  - `(product, created_at)` on `Review` — newest-first listing
  - `(product, helpful_count)` on `Review` — helpful-first sorting
  - `share_token` on `PCBuild` — public share URL lookup (`db_index=True`, unique)
  - `(build, slot)` unique constraint on `PCBuildItem`
- `Order` has nullable `delivery_partner` FK — reserved for future courier integration
- `ProductView` records older than 90 days are purged weekly by Celery (not soft-deleted — hard delete)

#### Model-to-App Import Map

This table is the **single reference** for which Django app owns each model. Use exact dotted paths
in every `import` statement. Getting these wrong causes circular imports and migration failures.

| Model(s) | Django App | Import Path | Notes |
|----------|-----------|-------------|-------|
| `CustomUser` | `accounts` | `from apps.accounts.models import CustomUser` | `AUTH_USER_MODEL = 'accounts.CustomUser'` |
| `VendorProfile` | `accounts` | `from apps.accounts.models import VendorProfile` | OneToOneField → CustomUser |
| `CustomerProfile` | `accounts` | `from apps.accounts.models import CustomerProfile` | OneToOneField → CustomUser; optional extended fields |
| `ShippingAddress` | `orders` | `from apps.orders.models import ShippingAddress` | FK → CustomUser; multiple per user |
| `Category` | `categories` | `from apps.categories.models import Category` | Self-FK `parent` for tree structure |
| `Brand` | `brands` | `from apps.brands.models import Brand` | |
| `Product` | `products` | `from apps.products.models import Product` | |
| `ProductImage` | `products` | `from apps.products.models import ProductImage` | FK → Product |
| `Cart` | `cart` | `from apps.cart.models import Cart` | OneToOneField → CustomUser |
| `CartItem` | `cart` | `from apps.cart.models import CartItem` | FK → Cart; FK → Product |
| `Wishlist`, `WishlistItem` | `wishlist` | `from apps.wishlist.models import Wishlist, WishlistItem` | Wishlist OneToOne → CustomUser |
| `Order` | `orders` | `from apps.orders.models import Order` | FK → CustomUser |
| `OrderItem` | `orders` | `from apps.orders.models import OrderItem` | FK → Order; FK → Product (+ price/name snapshot fields) |
| `ReturnRequest` | `orders` | `from apps.orders.models import ReturnRequest` | OneToOne → OrderItem |
| `ReturnEvidence` | `orders` | `from apps.orders.models import ReturnEvidence` | FK → ReturnRequest |
| `Review` | `reviews` | `from apps.reviews.models import Review` | FK → Product; FK → CustomUser |
| `ReviewImage` | `reviews` | `from apps.reviews.models import ReviewImage` | FK → Review |
| `ReviewHelpful` | `reviews` | `from apps.reviews.models import ReviewHelpful` | FK → Review; FK → CustomUser |
| `ProductView` | `recommendations` | `from apps.recommendations.models import ProductView` | FK → Product; FK → CustomUser (null=True for anon) |
| `SearchLog` | `recommendations` | `from apps.recommendations.models import SearchLog` | FK → CustomUser (null=True for anon); stores query + results_count + session_key |
| `CompatibilityAttribute` | `compatibility` | `from apps.compatibility.models import CompatibilityAttribute` | |
| `CompatibilityRule` | `compatibility` | `from apps.compatibility.models import CompatibilityRule` | FK → Category (×2); FK → CompatibilityAttribute (×2) |
| `PCBuild` | `compatibility` | `from apps.compatibility.models import PCBuild` | FK → CustomUser (null=True for anon) |
| `PCBuildItem` | `compatibility` | `from apps.compatibility.models import PCBuildItem` | FK → PCBuild; FK → Product |

> **Cross-app FK rule:** when App B needs a FK to App A's model (e.g. `Review` FK → `Product`),
> import only the model class, never the entire app module. Always use string references in
> `ForeignKey('products.Product', ...)` where circular imports are a risk, then resolve in
> `ready()` if needed.

> **`apps/dashboard/`** has **no models** — it contains only views and services that aggregate
> data by querying models from other apps. It never defines its own database tables.

---

## PART 3 — MODULAR BUILD ORDER FOR CLAUDE CODE

> Each module is a self-contained session for Claude Code.
> Start every session with:
> **"We are building PCCraft Marketplace. Read the master spec (v4.0) before writing any code.
> We are now on Module [N] — [Name]. Do not touch any previously completed module."**

---

### MODULE 0 — Project Scaffolding & Environment Setup

**Goal:** Create the skeleton. Both servers must start. No functionality yet.

#### Backend Tasks

1. **Project init:**
   - Create Django project at `backend/` using the `config/` layout from §1.3
   - Do NOT use the default `projectname/settings.py` structure — use `config/settings/` split

2. **`requirements.txt`** (pinned versions matching §2.1):
   ```
   Django>=6.0
   djangorestframework>=3.15
   djangorestframework-simplejwt>=5.4
   django-cors-headers>=4.4
   Pillow>=11.0
   django-filter>=24.3
   drf-spectacular>=0.28
   celery>=5.4
   celery[redis]>=5.4
   redis>=5.2
   django-storages>=1.14
   python-decouple>=3.8
   python-magic>=0.4.27
   psycopg2-binary>=2.9
   ```
   > Run `pip freeze > requirements.txt` after install to capture exact resolved versions.

3. **`config/settings/base.py`** — configure:
   - `INSTALLED_APPS`: include all `apps.*` app names (even if empty for now)
   - `AUTH_USER_MODEL = 'accounts.CustomUser'`
   - `REST_FRAMEWORK`: default auth = SimpleJWT, default permission = IsAuthenticated,
     default pagination = `apps.common.pagination.StandardResultsPagination`
   - `SIMPLE_JWT` settings: 15min access, 7day refresh, rotation ON, blacklist ON
   - `SPECTACULAR_SETTINGS`: title, version, description
   - `CELERY_BROKER_URL = env('REDIS_URL')`, `CELERY_RESULT_BACKEND = env('REDIS_URL')`
   - `MEDIA_URL`, `MEDIA_ROOT`
   - `CORS_ALLOWED_ORIGINS`

4. **`apps/common/`** — create fully:
   - `TimeStampedModel`: abstract model with `created_at`, `updated_at`, `is_deleted`,
     `deleted_at`. Include `ActiveManager` (excludes `is_deleted=True`) as default manager
     and `AllObjectsManager` as `all_objects`
   - `APIResponse`: static methods `success(data, message, status_code)` and
     `error(message, errors, status_code)` returning `Response` with envelope format
   - `StandardResultsPagination`: `PageNumberPagination` with `page_size=20`,
     `page_size_query_param='page_size'`, `max_page_size=100`
   - `IsCustomer`, `IsVendor`, `IsAdmin`, `IsApprovedVendor` permission classes
   - `FileMimeTypeValidator`: checks actual MIME using `python-magic`, not extension
   - Custom exception handler registered in DRF settings — wraps all errors in envelope

5. **`apps/accounts/models.py`** — stub `CustomUser` (fields filled in Module 1)
   - Must exist now so Django migrations can be created
   - Must have `email` as `USERNAME_FIELD`

6. **Run initial migrations:** `python manage.py makemigrations && python manage.py migrate`

7. **Verify:** `python manage.py runserver` starts; `/api/docs/` renders Swagger UI

#### Frontend Tasks

1. **Create Vite + React 19 app** at `frontend/`

2. **Install dependencies** (exact versions matching §2.1):
   ```json
   "react": "^19.0.0",
   "react-dom": "^19.0.0",
   "react-router-dom": "^8.0.0",
   "axios": "^1.9.0",
   "@tanstack/react-query": "^5.60.0",
   "zustand": "^5.0.0",
   "react-hook-form": "^7.55.0",
   "zod": "^3.24.0",
   "@hookform/resolvers": "^3.10.0",
   "lucide-react": "^0.470.0",
   "react-hot-toast": "^2.5.0",
   "framer-motion": "^12.0.0"
   ```
   Dev dependencies:
   ```json
   "tailwindcss": "^4.0.0",
   "@tailwindcss/vite": "^4.0.0",
   "vite": "^6.0.0",
   "@vitejs/plugin-react": "^4.3.0"
   ```

3. **`vite.config.js`** — use Tailwind v4 Vite plugin (no `postcss.config.js` needed in v4):
   ```js
   import { defineConfig } from 'vite'
   import react from '@vitejs/plugin-react'
   import tailwindcss from '@tailwindcss/vite'
   import path from 'path'

   export default defineConfig({
     plugins: [react(), tailwindcss()],
     resolve: {
       alias: {
         '@':           path.resolve(__dirname, 'src'),
         '@components': path.resolve(__dirname, 'src/components'),
         '@pages':      path.resolve(__dirname, 'src/pages'),
         '@services':   path.resolve(__dirname, 'src/services'),
         '@context':    path.resolve(__dirname, 'src/context'),
         '@hooks':      path.resolve(__dirname, 'src/hooks'),
         '@utils':      path.resolve(__dirname, 'src/utils'),
         '@assets':     path.resolve(__dirname, 'src/assets'),
       }
     }
   })
   ```

4. **`src/styles/globals.css`** — Tailwind v4 CSS-first config (replaces `tailwind.config.js`):
   ```css
   @import "tailwindcss";

   @theme {
     /* Chrome palette — sidebar, navbar, structural elements */
     --color-primary-900: #0F172A;   /* Sidebar background */
     --color-primary-800: #1E293B;   /* Navbar / top bar */
     --color-primary-700: #334155;   /* Active nav items, chrome hover states */

     /* Surface palette — page content, cards, inputs */
     --color-surface-50:  #FFFFFF;   /* Cards, modals, form panels */
     --color-surface-100: #F8FAFC;   /* Page / app background */
     --color-surface-200: #F1F5F9;   /* Input backgrounds, alternating rows */
     --color-surface-300: #E2E8F0;   /* Borders, dividers */

     /* Accent / Action palette */
     --color-accent-500: #6366F1;    /* Primary CTA, links, focus rings */
     --color-accent-400: #818CF8;    /* Hover on accent */
     --color-accent-300: #A5B4FC;    /* Disabled accent, subtle highlights */

     /* Text */
     --color-text-primary:   #0F172A; /* Main text on light surfaces */
     --color-text-secondary: #64748B; /* Subtext, placeholders on light surfaces */
     --color-text-inverse:   #F1F5F9; /* Text on dark chrome (sidebar, navbar) */

     /* Semantic */
     --color-success: #22C55E;
     --color-warning: #F59E0B;
     --color-danger:  #EF4444;
     --color-info:    #38BDF8;

     /* Typography */
     --font-sans:    "Inter", sans-serif;
     --font-heading: "Space Grotesk", sans-serif;
   }

   /* Base: light background, dark text on all content */
   body {
     background-color: var(--color-surface-100);
     color: var(--color-text-primary);
   }
   ```
   > **Note:** In Tailwind v4 all `@theme` tokens are automatically available as utility classes:
   > `bg-primary-900`, `text-accent-500`, `border-danger`, etc. No `tailwind.config.js` required.
   > Chrome elements (sidebar, navbar) use `bg-primary-900` / `bg-primary-800` with `text-inverse`.
   > Content areas use `bg-surface-100` with `text-primary`.

5. **`index.html`** — add Google Fonts preconnect + stylesheet link for Inter + Space Grotesk

6. **Create full folder structure** as defined in §1.3 — every folder must exist with at
   minimum an empty `index.js` or placeholder `.jsx` file

7. **`src/services/axiosInstance.js`**:
   - `baseURL: import.meta.env.VITE_API_BASE_URL`
   - Request interceptor: attach `Authorization: Bearer <token>` from `useAuthStore`
   - Also attach `X-Session-Key: <session_key>` from `localStorage` for anonymous view tracking
   - Response interceptor: on 401 → call refresh endpoint → update store → retry original request
     → on refresh failure → `clearAuth()` + redirect to `/login`

8. **Zustand stores** (`src/context/`) — use Zustand v5 `create` API with `immer` middleware:
   - `useAuthStore`: `{ user, accessToken, role, isAuthenticated, setAuth, clearAuth }`
   - `useCartStore`: `{ items, addItem, removeItem, updateQty, clearCart, totalItems, totalPrice }`
   - `useWishlistStore`: `{ wishlistIds: Set, setWishlistIds, toggleId }`

9. **`src/routes/AppRouter.jsx`**: use React Router v8 `createBrowserRouter` + `RouterProvider`.
   Define all routes with placeholder page components. Use `ProtectedRoute` wrapper with
   `allowedRoles` prop. Wrap admin routes in an admin layout route; vendor routes in a vendor
   layout route.

10. **`src/components/layout/Navbar.jsx`**: renders role-appropriate nav links.
    Guest: Login, Register · Customer: Shop, Cart, Wishlist, Profile · Vendor: Dashboard,
    Products, Orders · Admin: Dashboard. Navbar always uses `bg-primary-800` with `text-inverse`.

11. **`src/components/layout/Footer.jsx`**: minimal footer with logo + copyright.

12. **`src/App.jsx`**: wraps everything in `QueryClientProvider`, `RouterProvider`,
    and `Toaster`. No theme class toggling — the single light theme is applied statically
    via `globals.css`.

13. **Verify:** `npm run dev` starts; navbar renders with `bg-primary-800` dark bar; page
    background is `bg-surface-100` (light); placeholder pages render correctly.

**Deliverable:** Both servers start cleanly. Swagger UI accessible. Frontend renders dark
navbar (`bg-primary-800`) with light content area (`bg-surface-100`) and role-aware placeholder pages.

---

### MODULE 1 — Authentication System

**Goal:** Complete auth flow: customer register, vendor register (multi-step), login with role
selector, logout, profile view/edit, JWT auto-refresh.

#### Backend Tasks (`apps/accounts/`)

**`models.py`:**
- `CustomUser` fields:
  - `email` (EmailField, unique, `USERNAME_FIELD`)
  - `full_name` (CharField 150)
  - `phone` (CharField 20, blank=True)
  - `role` (TextChoices: `CUSTOMER`, `VENDOR`, `ADMIN`)
  - `date_of_birth` (DateField, null=True, blank=True)
  - `gender` (TextChoices: `MALE`, `FEMALE`, `PREFER_NOT_TO_SAY`, blank=True)
  - `avatar` (ImageField, `upload_to='profiles/avatars/%Y/%m/'`, null=True, blank=True)
  - `is_active` (default=True), `is_staff` (default=False), `is_superuser` (default=False)
  - Inherits `TimeStampedModel`
  - `REQUIRED_FIELDS = ['full_name']`
- `CustomerProfile` fields:
  - OneToOneField → CustomUser (related_name='customer_profile')
  - `default_shipping_address` (FK → `orders.ShippingAddress`, null=True, on_delete=SET_NULL)
- `VendorProfile` fields:
  - OneToOneField → CustomUser (related_name='vendor_profile')
  - `business_name`, `owner_name` (CharFields)
  - `business_type` (TextChoices: SOLE_PROP / PARTNERSHIP / PVT_LTD / OTHER)
  - `business_phone` (blank=True)
  - `trade_license_number` (CharField)
  - `trade_license_doc` (FileField, `upload_to='documents/trade_licenses/%Y/%m/'`)
  - `nid_number` (CharField)
  - `nid_doc` (FileField, `upload_to='documents/nid_docs/%Y/%m/'`)
  - `business_address` (JSONField: `{street, city, district, postal_code}`)
  - `status` (TextChoices: PENDING / APPROVED / REJECTED / INFO_REQUESTED, default=PENDING)
  - `rejection_reason` (TextField, blank=True)
  - `store_name`, `store_description` (CharField/TextField)
  - `store_slug` (SlugField, unique, auto-generated from `store_name` on save — used in `/stores/:storeSlug` public route)
  - `store_contact_email` (EmailField, blank=True — overrides vendor account email for customer enquiries)
  - `store_logo` (ImageField, upload_to='stores/logos/')
  - `store_banner` (ImageField, upload_to='stores/banners/')
  - `vendor_return_policy` (TextField, blank=True — overrides platform default when non-empty; see §2.8)
  - `low_stock_threshold` (PositiveSmallIntegerField, default=5)

**`services.py` (`AuthService`):**
- `register_customer(validated_data)` → create CustomUser (role=CUSTOMER) + CustomerProfile
- `register_vendor(validated_data, files)` → create CustomUser (role=VENDOR) + VendorProfile
  (status=PENDING) + trigger admin notification task
- `login(email, password, expected_role)` → authenticate, verify role matches, return tokens

**`serializers.py`:**
- `CustomerRegisterSerializer`: validates phone regex, password match, age ≥ 13 if DOB provided
- `VendorRegisterSerializer`: validates file MIME types using `FileMimeTypeValidator`
- `LoginSerializer`: email + password fields
- `UserProfileSerializer`: readable + writable fields for profile update
- `VendorProfileSerializer`: includes status (read-only), store fields (read-write)
- `TokenResponseSerializer`: wraps access/refresh + user data (id, email, full_name, role, avatar)

**`views.py`:** (all views call services only — no logic in views)
- `CustomerRegisterView` (POST, AllowAny)
- `VendorRegisterView` (POST, AllowAny) — handles multipart for document uploads
- `LoginView` (POST, AllowAny) — returns `TokenResponseSerializer` data
- `LogoutView` (POST, IsAuthenticated) — blacklists refresh token
- `ProfileView` (GET, PATCH — IsAuthenticated) — routes to customer or vendor serializer by role
- `VendorDocumentUploadView` (PATCH — IsVendor) — multipart, allows resubmission

**`urls.py`:**
```
POST   /api/v1/auth/register/customer/
POST   /api/v1/auth/register/vendor/
POST   /api/v1/auth/login/
POST   /api/v1/auth/logout/
POST   /api/v1/auth/token/refresh/
GET    /api/v1/auth/profile/
PATCH  /api/v1/auth/profile/
PATCH  /api/v1/auth/vendor/documents/
```

#### Frontend Tasks

**`src/pages/Login/LoginPage.jsx`:**
- Phase 1: 3 role cards (Customer / Vendor / Admin) with icons, descriptions, hover animation
- Phase 2: Email + password form slides in (Framer Motion) after role selection
- Show/hide password toggle
- Role mismatch: clear toast error, reset to phase 1
- On success: update `useAuthStore`, redirect by role

**`src/pages/Register/CustomerRegisterPage.jsx`:**
- Single-page form with all customer fields
- Zod schema: phone regex, password strength, age validation, confirm password match
- Real-time validation feedback (red helper text under each field)
- Disabled submit button until `terms` checkbox is checked

**`src/pages/Register/VendorRegisterPage.jsx`:**
- 4-step stepper using `src/components/common/Stepper.jsx`
- Each step uses React Hook Form with individual Zod schemas
- Step 3: `FileUpload.jsx` with MIME type client preview + size check (5MB limit displayed)
- Step 4: Read-only summary in a `Card` grid — back button returns to step 3 for edits
- On submit: POST multipart form data to `/api/v1/auth/register/vendor/`

**`src/pages/Profile/VendorProfilePage.jsx`:**
- Status banner at top (pending = warning yellow, rejected = danger red, approved = success green)
- Rejection reason displayed if status = REJECTED with "Resubmit Documents" CTA
- Store info edit form (only visible if APPROVED)

**Zustand `useAuthStore`:**
- `setAuth(user, accessToken, role)`: store in memory (Zustand), NOT localStorage
- `clearAuth()`: clears store, removes refresh token cookie (if using cookies)
- On app init: attempt silent refresh via `/api/v1/auth/token/refresh/` — if fails, stay logged out

**Deliverable:** Full auth flow working end-to-end. Role-based redirects. Vendor registration
submits documents. Vendor dashboard blocked with status banner until approved.

---

### MODULE 2 — Categories, Brands & Product Foundation

**Goal:** Admin can manage categories and brands. Vendors can create/edit/delete products.
Public shop page lists products with filtering and pagination.

#### Backend Tasks

**`apps/categories/models.py`:**
- `Category`: `name`, `slug` (auto), `description`, `icon` (ImageField), `parent`
  (self-FK null=True for subcategories), `is_active` (default=True)
- Inherits `TimeStampedModel`

**`apps/brands/models.py`:**
- `Brand`: `name`, `slug` (auto), `logo` (ImageField), `description`, `is_active`

**`apps/products/models.py`:**
- `Product`: all fields from §2.7 table. Inherits `TimeStampedModel` with soft delete.
  Add `effective_price` property: returns `discounted_price` if active discount window,
  else `base_price`
- `ProductImage`: FK Product, `image`, `alt_text`, `display_order` (PositiveSmallIntegerField),
  `is_primary` (BooleanField) — enforce max 8 images per product in service
- `PriceHistory`: FK Product, `price` (DecimalField), `recorded_at` (auto DateTimeField)
  — append-only (never delete records)

**`apps/products/services.py` (`ProductService`):**
- `create_product(vendor, validated_data, images)`: validate spec keys match category,
  create Product, create ProductImage records in display_order, record PriceHistory
- `update_product(product, validated_data, images)`: if price changed, append PriceHistory
- `reorder_images(product, ordered_image_ids)`: update display_order based on submitted list
- `set_primary_image(product, image_id)`: unset all, set new primary
- `delete_product(product, vendor)`: soft delete, verify vendor owns product

**`apps/products/filters.py`:**
```python
class ProductFilter(FilterSet):
    category  = ModelChoiceFilter(field_name='category__slug', to_field_name='slug')
    brand     = ModelMultipleChoiceFilter(field_name='brand__slug', to_field_name='slug')
    min_price = NumberFilter(method='filter_min_price')
    max_price = NumberFilter(method='filter_max_price')
    in_stock  = BooleanFilter(field_name='stock_quantity', method='filter_in_stock')

    class Meta:
        model  = Product
        fields = ['category', 'brand', 'min_price', 'max_price', 'in_stock', 'status']

    # NOTE: effective_price is a Python @property — Django ORM cannot filter on it directly.
    # Annotate the queryset with a DB-level effective price using Case/When, then filter on it.
    def _annotate_effective_price(self, qs):
        from django.db.models import Case, When, F, DecimalField
        from django.utils import timezone
        now = timezone.now()
        return qs.annotate(
            effective_price_db=Case(
                When(
                    discounted_price__isnull=False,
                    discount_start__lte=now,
                    discount_end__gte=now,
                    then=F('discounted_price'),
                ),
                default=F('base_price'),
                output_field=DecimalField(max_digits=12, decimal_places=2),
            )
        )

    def filter_min_price(self, qs, name, value):
        return self._annotate_effective_price(qs).filter(effective_price_db__gte=value)

    def filter_max_price(self, qs, name, value):
        return self._annotate_effective_price(qs).filter(effective_price_db__lte=value)
```

**Serializers:**
- `ProductListSerializer`: id, slug, name, brand.name, category.name, base_price,
  discounted_price, effective_price, primary_image_url, stock_quantity, avg_rating
- `ProductDetailSerializer`: all + all images + specs JSONField + vendor store_name
- `ProductCreateUpdateSerializer`: all writable fields + specs validation per category
- `CategoryTreeSerializer`: recursive (parent → children)

**Endpoints:**
```
GET    /api/v1/categories/               (public, tree format)
POST   /api/v1/categories/               (admin only)
PATCH  /api/v1/categories/{slug}/        (admin only)
DELETE /api/v1/categories/{slug}/        (admin only)

GET    /api/v1/brands/                   (public)
POST   /api/v1/brands/                   (admin only)
PATCH  /api/v1/brands/{slug}/            (admin only)
DELETE /api/v1/brands/{slug}/            (admin only)

GET    /api/v1/products/                 (public, paginated, filterable, sortable)
GET    /api/v1/products/{slug}/          (public, full detail)
GET    /api/v1/vendor/products/          (vendor's own products)
POST   /api/v1/vendor/products/          (create, multipart for images)
PATCH  /api/v1/vendor/products/{slug}/   (update)
DELETE /api/v1/vendor/products/{slug}/   (soft delete)
POST   /api/v1/vendor/products/{slug}/images/reorder/
PATCH  /api/v1/vendor/products/{slug}/images/{id}/set-primary/
```

**Ordering params (`?ordering=`):** `price`, `-price`, `created_at`, `-created_at`, `avg_rating`

> **`avg_rating` ordering implementation note:** `Product.avg_rating` is a Python `@property`,
> not a database column, so Django's `OrderingFilter` cannot sort on it directly. The products
> list view must annotate the queryset with a DB-computed average before applying ordering:
> ```python
> from django.db.models import Avg
> qs = qs.annotate(avg_rating_db=Avg(
>     'review__rating', filter=Q(review__is_hidden=False)
> ))
> ```
> Map the `avg_rating` ordering param to `avg_rating_db` in the view's `OrderingFilter`.
> The `ProductListSerializer` continues to expose `avg_rating` (the property), which uses
> the Redis-cached value for read efficiency.

#### Frontend Tasks

**`src/components/products/ProductCard.jsx`:**
- `rounded-xl` card with `primary-800` bg, `shadow-lg`
- Image (aspect-ratio 4:3, `object-cover`)
- Brand badge (accent color, `rounded-full`)
- Name (Space Grotesk, 2-line clamp)
- `PriceDisplay.jsx`: effective price, strike-through base price if discounted, discount % badge
- `StockBadge.jsx`: green "In Stock", yellow "Low Stock (N left)", red "Out of Stock"
- Wishlist heart icon (top-right corner, overlay on image, toggles `useWishlistStore`)
- "Add to Cart" button (`accent-500`, full width, disabled if out of stock)
- Hover: card lifts with `shadow-indigo-500/20`

**`src/components/products/ProductGrid.jsx`:**
- `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
- Skeleton: show 8 `Skeleton.jsx` placeholders while loading
- Empty state: `EmptyState.jsx` with "No products found" message

**`src/pages/ProductDetails/ProductDetailPage.jsx`:**
- Left: `ImageGallery.jsx` (main + 4 thumbnail strip)
- Right: name, brand, rating snapshot, price, stock, warranty, short description,
  quantity selector (1 to stock_quantity), "Add to Cart" + "Add to Wishlist" buttons
- Tabs: "Specifications" (specs table) | "Reviews" (stub → filled in Module 6) |
  "Compatibility" (stub → filled in Module 8)
- Below: `RecommendationCarousel` stubs (filled in Module 7)

**`src/pages/Products/ShopPage.jsx`:**
- Left sidebar (collapsible on mobile): `ProductFilters.jsx`
  - Category tree (expandable with chevron icons)
  - Brand checkboxes
  - Price range: two number inputs + range slider
  - "In Stock Only" toggle
- Main: sort dropdown + result count + `ProductGrid` + `Pagination`
- All filter state synced to URL params via `useSearchParams`

**`src/pages/Vendor/VendorProductFormPage.jsx`:**
- Category selector (dropdown) triggers dynamic spec field rendering
- Spec fields: render key-label + input per spec key for selected category
- Image multi-upload: `FileUpload.jsx` extended to show preview grid, drag-to-reorder (use
  `@dnd-kit/core` or simple index swap), star icon to set primary
- Price section: base price, toggle "Add Discount" → reveals discounted price + date range picker
- Stock + low-stock threshold inputs
- Status selector (Draft / Active)

**Deliverable:** Shop page browsable. Vendor product CRUD works. Admin category/brand CRUD works.
Product card shows correct prices, badges, and wishlist state.

---

### MODULE 3 — Cart & Wishlist

**Goal:** Server-persisted cart and wishlist for authenticated customers.
Optimistic UI updates with server sync.

#### Backend Tasks

**`apps/cart/models.py`:**
- `Cart`: OneToOneField → CustomUser, `updated_at` (auto)
- `CartItem`: FK Cart, FK Product, `quantity` (PositiveIntegerField, min=1),
  `is_unavailable` (BooleanField default=False)
  - `UniqueConstraint(fields=['cart', 'product'])`

**`apps/cart/services.py` (`CartService`):**
- `get_or_create_cart(user)` → Cart
- `add_item(cart, product_id, quantity)`: if exists → increment; check `stock_quantity`;
  raise `ValidationError` if quantity > stock
- `update_item(cart_item, quantity)`: validate against stock; if quantity=0 → remove
- `remove_item(cart_item)`: delete
- `clear_cart(cart)`: delete all CartItems
- `mark_unavailable_items(cart)`: called after a product goes out of stock
- `sync_cart_with_stock(cart)`: on cart fetch, check each product's current stock,
  mark items unavailable if needed
- `get_cart_summary(cart)` → `{items, subtotal, item_count}`

**`apps/wishlist/services.py`:**
- `add_to_wishlist(user, product_id)`: idempotent (no error if already exists)
- `remove_from_wishlist(user, product_id)`
- `move_to_cart(user, wishlist_item_id)`: calls `CartService.add_item`, then removes from wishlist

**Serializers:**
- `CartItemSerializer`: product (nested `ProductListSerializer`), quantity, is_unavailable,
  item_total (computed)
- `CartSerializer`: items, subtotal, item_count, updated_at
- `WishlistItemSerializer`: product (nested), added_at

**Endpoints:**
```
GET    /api/v1/cart/                              (sync with stock on each GET)
POST   /api/v1/cart/items/                        body: {product_id, quantity}
PATCH  /api/v1/cart/items/{id}/                   body: {quantity}
DELETE /api/v1/cart/items/{id}/
DELETE /api/v1/cart/clear/

GET    /api/v1/wishlist/
POST   /api/v1/wishlist/items/                    body: {product_id}
DELETE /api/v1/wishlist/items/{id}/
POST   /api/v1/wishlist/items/{id}/move-to-cart/
```

All endpoints: `IsAuthenticated` + `IsCustomer`.

#### Frontend Tasks

**`src/context/useCartStore.js`:** `items`, `addItem`, `removeItem`, `updateQty`,
`clearCart`, `totalItems`, `totalPrice` — seeded from `/api/v1/cart/` on auth.

**`src/context/useWishlistStore.js`:** `wishlistIds` (Set of product IDs) for O(1) heart icon
state checks — seeded from `/api/v1/wishlist/` on auth.

**`src/components/cart/CartDrawer.jsx`:**
- Fixed right-side drawer, `translate-x` slide animation (Framer Motion)
- Triggered by cart icon in Navbar
- `CartItem.jsx` row: thumbnail, name, vendor, price, qty stepper (± buttons), remove ×
- Unavailable items: greyed out with "Out of Stock — Remove to Continue" warning
- Footer: subtotal, "View Cart" link, "Proceed to Checkout" button (disabled if any unavailable items)

**`src/pages/Cart/CartPage.jsx`:**
- Same content as Drawer but full-page layout with more spacing
- "Continue Shopping" link back to shop
- `RecommendationCarousel` "You might also need..." below (stub, filled Module 7)

**`src/pages/Wishlist/WishlistPage.jsx`:**
- `ProductGrid`-style layout using `WishlistCard.jsx`
- Each card: product info + "Move to Cart" button + "Remove" × icon
- Empty state: heart icon + "Your wishlist is empty" + "Browse Products" CTA

**Optimistic updates:** `useCartStore.updateQty` updates client state immediately, then
`PATCH /api/v1/cart/items/{id}/` in background; on error → revert + show error toast.

**Deliverable:** Cart and wishlist fully functional. Cart badge in navbar shows count.
Unavailable items highlighted. Wishlist heart toggles instantly.

---

### MODULE 4 — Order System

**Goal:** Complete checkout flow, order placement, order history, and vendor order management.

#### Backend Tasks

**`apps/orders/models.py`:**
- `ShippingAddress`: FK User, `full_name`, `phone`, `street_address`, `city`, `district`,
  `postal_code`, `country` (default='BD'), `is_default` (BooleanField)
  - `save()` override: if `is_default=True` → unset all other addresses for user
- `Order`: FK User, `order_number` (unique, auto-generated in service), `status`
  (TextChoices enum), `shipping_address_snapshot` (JSONField), `subtotal`, `shipping_fee`
  (default=0), `tax` (default=0), `total`, `payment_method` (default='COD'),
  `payment_status` (TextChoices: PENDING/PAID), `notes`, `delivery_partner` (FK nullable),
  `cancelled_at` (DateTimeField nullable)
- `OrderItem`: FK Order, FK Product (SET_NULL on delete to preserve history), FK VendorProfile,
  `product_name_snapshot`, `unit_price` (DecimalField — immutable after creation),
  `discount_snapshot`, `quantity`, `status` (vendor-controlled TextChoices),
  `shipped_at`, `delivered_at` (DateTimeField nullable)

**`apps/orders/services.py`:**

`OrderService`:
- `generate_order_number()` → `PCM-YYYYMMDD-{5-digit seq}` (use DB sequence or atomic counter)
- `create_order_from_cart(user, address_id)`:
  1. Fetch cart, validate not empty, validate no unavailable items
  2. Validate stock for each item (atomic, using `select_for_update()`)
  3. Create `Order` with `shipping_address_snapshot` = serialized address
  4. Create `OrderItem` per cart item (set `unit_price` = `product.effective_price`)
  5. Decrement `stock_quantity` for each product (atomic)
  6. `CartService.clear_cart(cart)`
  7. Return created order
- `cancel_order(order_id, user)`:
  - Only if `status in [PENDING_PAYMENT, CONFIRMED]`
  - Set status = CANCELLED, `cancelled_at` = now
  - Restore stock quantities

`AddressService`:
- `create_address(user, data)`: if first address → set `is_default=True`
- `update_address(address, data)`: if setting default → unset others
- `delete_address(address)`: if default → error (must set new default first)

**Endpoints:**
```
GET    /api/v1/addresses/
POST   /api/v1/addresses/
PATCH  /api/v1/addresses/{id}/
DELETE /api/v1/addresses/{id}/
POST   /api/v1/addresses/{id}/set-default/

POST   /api/v1/orders/                            (place order)
GET    /api/v1/orders/                            (customer's orders, paginated)
GET    /api/v1/orders/{order_number}/
POST   /api/v1/orders/{order_number}/cancel/

GET    /api/v1/vendor/orders/                     (filter: status, date range)
GET    /api/v1/vendor/orders/{order_number}/
PATCH  /api/v1/vendor/orders/items/{id}/status/   body: {status}
```

**Vendor status update validation:** enforce forward-only status progression.
`CONFIRMED → PROCESSING → SHIPPED → DELIVERED` — cannot skip or go backward.

#### Frontend Tasks

**`src/pages/Checkout/CheckoutPage.jsx`** — 4-step stepper:

*Step 1 — Shipping Address:*
- Display saved address cards (highlight default with `accent-500` border)
- "Add New Address" opens a `Modal` with address form
- "Edit" / "Delete" (non-default only) actions on each card

*Step 2 — Order Review:*
- List of cart items with vendor name, quantity, unit price
- Subtotal, shipping (Free / ৳0 placeholder), tax (৳0 placeholder), **Total**
- "Back" returns to Step 1

*Step 3 — Payment:*
- "Cash on Delivery" card (pre-selected, only option)
- Placeholder cards for future: bKash, Nagad, Card (disabled with "Coming Soon" badge)

*Step 4 — Confirmation:*
- Success animation (Framer Motion checkmark)
- Order number displayed prominently
- "View Order" button → `/orders/{order_number}`
- Clear cart after reaching this step

**`src/pages/Orders/OrderHistoryPage.jsx`:**
- Table/list of orders: order number, date, total, status badge, item count
- Sort by: newest first (default), oldest
- Filter by status (tab bar or dropdown)
- Click row → `OrderDetailPage`

**`src/pages/Orders/OrderDetailPage.jsx`:**
- Order number + date header
- Status stepper (visual timeline using `Stepper.jsx`)
- Items table: thumbnail, name, vendor, qty, unit price, item total, item status badge
- Shipping address card (from snapshot)
- Price summary card
- "Cancel Order" button (only if status PENDING_PAYMENT or CONFIRMED) → confirm dialog
- "Request Return" button per item (only if status DELIVERED and within 7 days)

**`src/pages/Vendor/VendorOrdersPage.jsx`:**
- Table of order items for vendor's products
- Columns: order number, product thumbnail + name, customer (first name + last initial),
  quantity, unit price, order date, current status (dropdown to update)
- Filter tabs: All / Processing / Shipped / Delivered
- Status dropdown: disabled for backward transitions

**Deliverable:** Customer can checkout and place orders. Vendor can see and update item statuses.
Order detail shows correct timeline. Cancel flow restores stock.

---

### MODULE 5 — Returns & Refunds

**Goal:** Full 7-step return request lifecycle from customer initiation to admin refund confirmation.

#### Backend Tasks

**`apps/orders/models.py`** — extend:
- `ReturnRequest`: `OneToOneField → OrderItem` (one return per item — enforced at DB level), FK User (customer),
  `reason` (TextChoices: DAMAGED/NOT_AS_DESCRIBED/WRONG_ITEM/DEFECTIVE/MISSING_PARTS),
  `description` (TextField), `status` (TextChoices: PENDING/APPROVED/REJECTED/
  SHIPPED_BACK/RECEIVED/REFUND_INITIATED/REFUNDED), `rejection_reason` (blank=True),
  `tracking_number_return` (blank=True), `vendor_notes` (blank=True), `admin_notes` (blank=True),
  Status timestamps: `approved_at`, `rejected_at`, `shipped_back_at`, `received_at`,
  `refund_initiated_at`, `refunded_at` (all DateTimeField nullable)
- `ReturnEvidence`: FK ReturnRequest, `image` (ImageField, upload_to='returns/evidence/%Y/%m/')

**`apps/orders/services.py`** — add `ReturnService`:
- `initiate_return(user, order_item_id, data, images)`:
  1. Verify `order_item.status == 'DELIVERED'`
  2. Verify `order_item.delivered_at ≥ now - 7 days`
  3. Verify no existing `ReturnRequest` for this item
  4. Create `ReturnRequest` + up to 4 `ReturnEvidence` records
- `approve_return(vendor, return_id)`: status → APPROVED, set `approved_at`
- `reject_return(vendor, return_id, reason)`: status → REJECTED, set `rejection_reason`
- `ship_back(customer, return_id, tracking_number)`: status → SHIPPED_BACK
- `mark_received(vendor, return_id)`: status → RECEIVED
- `process_refund(admin, return_id)`: status → REFUND_INITIATED
- `confirm_refund(admin, return_id)`: status → REFUNDED

**Endpoints:**
```
POST   /api/v1/orders/items/{id}/return/          (customer, multipart for evidence)
GET    /api/v1/returns/                            (customer's own returns)
GET    /api/v1/returns/{id}/
POST   /api/v1/returns/{id}/ship-back/            body: {tracking_number}

PATCH  /api/v1/vendor/returns/{id}/review/        body: {action: approve|reject, reason}
PATCH  /api/v1/vendor/returns/{id}/mark-received/
GET    /api/v1/vendor/returns/

PATCH  /api/v1/admin/returns/{id}/process-refund/
PATCH  /api/v1/admin/returns/{id}/confirm-refund/
GET    /api/v1/admin/returns/
```

#### Frontend Tasks

**"Request Return" integration in `OrderDetailPage`:**
- Button visible per item only if: `item.status == DELIVERED` and `now - item.delivered_at ≤ 7 days`
- Show days-remaining hint: "Return window closes in N days"
- Click → opens `ReturnRequestModal.jsx`

**`ReturnRequestModal.jsx`:**
- Reason dropdown (enum options)
- Description textarea (min 20 chars)
- `FileUpload.jsx` for evidence (max 4 images, preview grid)
- Submit → `POST /api/v1/orders/items/{id}/return/`

**`src/pages/Returns/ReturnStatusPage.jsx`:**
- Visual timeline of statuses (similar to order status stepper)
- Show current status prominently with color coding
- If APPROVED: show return address + "I've Shipped It" button → opens tracking input form
- If REJECTED: show rejection reason
- Evidence images displayed in gallery

**Vendor Returns (`VendorReturnsPage`):**
- Table: return ID, product, customer, reason, status, date
- Expandable row: description, evidence image thumbnails (click to enlarge)
- Actions per status: PENDING → "Approve" + "Reject" buttons; SHIPPED_BACK → "Mark Received"
- Reject modal: required reason textarea

**Admin Returns (`AdminReturnsPage`):**
- Full table with vendor + customer columns
- Filter by status
- RECEIVED → "Process Refund" button; REFUND_INITIATED → "Confirm Refunded"
- Admin notes textarea (saved inline)

**Deliverable:** Complete return lifecycle end-to-end. Customer initiates, vendor reviews,
customer ships back, vendor confirms receipt, admin processes refund.

---

### MODULE 6 — Reviews & Ratings

**Goal:** Verified-purchase-gated reviews with images; vendor replies (one per review, editable);
helpful votes; and full admin moderation (hide/restore reviews, remove vendor replies).

#### Backend Tasks

**`apps/reviews/models.py`:**
- `Review`: FK Product, FK User (CustomUser),
  `rating` (PositiveSmallIntegerField, validators=[MinVal(1), MaxVal(5)]),
  `title` (CharField 200), `body` (TextField, min 30 chars — validated in serializer),
  `is_verified_purchase` (BooleanField, set by service, **never user-submitted**),
  `helpful_count` (PositiveIntegerField default=0),
  `is_hidden` (BooleanField default=False — admin moderation flag),
  `vendor_reply` (TextField blank=True), `vendor_replied_at` (DateTimeField nullable),
  `vendor_reply_edited_at` (DateTimeField nullable)
  - `UniqueConstraint(fields=['product', 'user'])` — one review per customer per product
  - DB index on `(product, created_at)` for newest-first listing
  - DB index on `(product, helpful_count)` for helpful-first sorting
  - DB index on `(product, rating)` for rating filter
- `ReviewImage`: FK Review (on_delete=CASCADE), `image` (ImageField, `upload_to='reviews/images/%Y/%m/'`)
  — max 4 per review enforced in `ReviewService.create_review`
- `ReviewHelpful`: FK Review, FK User — composite unique `(review, user)`; prevents double-vote

**`apps/reviews/services.py` (`ReviewService`):**

`can_review(user, product_id) → bool`:
- **HARD GATE — no configurable flag:**
  - Return `True` only if `OrderItem.objects.filter(order__user=user, product_id=product_id, status='DELIVERED').exists()`
  - Also return `False` if user already has a review for this product
  - These two checks together form the **only** gate; do not add any other bypass

`create_review(user, product_slug, data, images) → Review`:
1. Resolve product from slug; raise `PermissionDenied` with message
   `"You can only review products you have purchased and received."` if `can_review` fails
2. Set `is_verified_purchase = True` if user has any DELIVERED `OrderItem` for this product
   (always true here since `can_review` passed, but set explicitly for data integrity)
3. Create `Review` within `transaction.atomic()`
4. Create up to 4 `ReviewImage` records (enforce in service, not just serializer)
5. Invalidate `product:avg_rating:{product_id}` in Redis
6. Return created review

`update_review(user, review_id, data, images) → Review`:
- Only the review author may edit
- Editable fields: `title`, `body`, `images` (replace all images — delete old, create new)
- **Rating is immutable after creation** — reject any attempt to change it with a 400 error
- Re-invalidate avg_rating cache on update (rating unchanged but hidden status may change later)

`delete_review(user, review_id)`:
- Only the review author may delete
- Hard delete (not soft) — removes `Review` + all `ReviewImage` records
- Invalidate `product:avg_rating:{product_id}` in Redis

`toggle_helpful(user, review_id) → {helpful: bool, count: int}`:
- Create `ReviewHelpful(review, user)` if not exists → increment `helpful_count`, return `{helpful: True, count: N}`
- Delete if exists → decrement `helpful_count`, return `{helpful: False, count: N}`
- Use `transaction.atomic()` + `select_for_update()` on Review to prevent race conditions

`add_vendor_reply(vendor, review_id, reply_text) → Review`:
- Verify `review.product.vendor == vendor.vendor_profile` — raise `PermissionDenied` otherwise
- **One reply per review:** if `vendor_reply` already set → UPDATE in place (edit), set `vendor_reply_edited_at = now()`
- If no reply yet → set `vendor_reply = reply_text`, `vendor_replied_at = now()`
- Vendor reply **cannot be deleted** — only edited (overwritten with new text)
- Return updated review

`hide_review(admin, review_id) → Review`:
- Set `is_hidden = True`; invalidate `product:avg_rating:{product_id}` cache

`restore_review(admin, review_id) → Review`:
- Set `is_hidden = False`; invalidate `product:avg_rating:{product_id}` cache

`remove_vendor_reply(admin, review_id) → Review`:
- Admin-only: clear `vendor_reply`, `vendor_replied_at`, `vendor_reply_edited_at`
- Use case: vendor reply violates community guidelines

**Product average rating:**
- `Product.avg_rating` property: compute with
  `Review.objects.filter(product=self, is_hidden=False).aggregate(Avg('rating'))['rating__avg']`
- Cached in Redis as `product:avg_rating:{product.id}` (float string or `"null"`)
- Invalidated (deleted from Redis) on: review create, review delete, review hide, review restore

**Serializers:**
- `ReviewListSerializer`: id, user.full_name (truncated), user.avatar_url, rating, title, body,
  is_verified_purchase badge, helpful_count, is_helpful_by_me (computed per request user),
  vendor_reply, vendor_replied_at, vendor_reply_edited_at, images, created_at (relative)
- `ReviewCreateSerializer`: rating, title (min 5 chars), body (min 30 chars), images (write-only)
- `ReviewUpdateSerializer`: title, body, images only — `rating` field excluded entirely
- `VendorReplySerializer`: reply_text (min 10 chars, max 1000 chars)
- `ReviewModerationSerializer`: is_hidden (admin hide/restore)

**Endpoints:**
```
POST   /api/v1/products/{slug}/reviews/           (IsCustomer, multipart)
GET    /api/v1/products/{slug}/reviews/           (public, paginated)
       ?ordering=newest|oldest|helpful|rating_high|rating_low
PATCH  /api/v1/reviews/{id}/                      (review author only — no rating change)
DELETE /api/v1/reviews/{id}/                      (review author only)
POST   /api/v1/reviews/{id}/helpful/              (IsAuthenticated)
GET    /api/v1/reviews/{id}/can-review/?product={slug}   (IsCustomer — returns {can_review, reason})

POST   /api/v1/vendor/reviews/{id}/reply/         (IsApprovedVendor — create or update reply)
GET    /api/v1/vendor/reviews/                    (IsApprovedVendor — all reviews for vendor's products)
       ?ordering=newest|rating_high|rating_low
       &replied=true|false
       &rating=1|2|3|4|5

PATCH  /api/v1/admin/reviews/{id}/moderate/       (IsAdmin) body: {is_hidden: true|false}
DELETE /api/v1/admin/reviews/{id}/reply/          (IsAdmin — remove vendor reply)
GET    /api/v1/admin/reviews/                     (IsAdmin, full list)
       ?is_hidden=true|false&rating=&product=&vendor=&ordering=
```

#### Frontend Tasks

**Rating breakdown widget** (integrated in `ProductDetailPage` Reviews tab):
- Overall avg rating (large number + star display)
- Bar chart: 5★ N%, 4★ N%, 3★ N%, 2★ N%, 1★ N% (Tailwind width bars, no library needed)
- Total review count; "Verified Purchase" count below bars

**`ReviewCard.jsx`:**
- Avatar (initials fallback if no avatar), display name, `Verified Purchase` green badge,
  star display, date (relative: "2 days ago"), created_at full date in Tooltip on hover
- Review body (3-line clamp with "Read more" expand button)
- Up to 4 images in a thumbnail row (click to enlarge via `Modal.jsx`)
- "Helpful (N)" button: accent-colored ring on active state; optimistic UI toggle
- **Vendor reply section**: indented block with `primary-700` background, store logo (16px) + store name
  label, reply text, replied_at date; if `vendor_reply_edited_at` is set show "(edited)" in
  `text-secondary` next to date
- Edit / Delete buttons only visible to review author
- "Report" icon (flag) visible to all authenticated non-authors → placeholder toast for now

**`WriteReviewModal.jsx`:**
- On open: call `GET /api/v1/reviews/can-review/?product={slug}` to verify eligibility
  - If `can_review = false`: show locked state with message
    `"You can only review products you have purchased and received."` + disabled form
  - If `can_review = true`: show the full form
- Interactive star selector (hover preview → click to set; clicking same star again deselects to 0
  → show validation error if submitted at 0)
- Title input (min 5 chars), body textarea (min 30 chars with live char count display)
- `FileUpload.jsx` for up to 4 images (drag-and-drop + click; preview grid with × to remove each)
- Submit button: disabled while `can_review = false` or form is invalid
- On success: invalidate `['products', 'reviews', slug]` query cache → review list refreshes

**`VendorReplyModal.jsx`** (used inside `ReviewCard` for vendor, and in `VendorReviewsPage`):
- Textarea (min 10, max 1,000 chars with live counter)
- If existing reply: pre-fill textarea; show "Edit Reply" heading; show original `vendor_replied_at`
- Submit calls `POST /api/v1/vendor/reviews/{id}/reply/`
- On success: reply section updates inline without page reload

**`src/pages/Vendor/VendorReviewsPage.jsx`** (new page):
- Header: "Customer Reviews" + total count badge
- Filter bar:
  - Star filter tabs: All ★ | 5★ | 4★ | 3★ | 2★ | 1★
  - Reply status dropdown: All | Replied | Unreplied
  - Sort: Newest first | Oldest first | Highest rating | Lowest rating
- Review list (not a table — use card layout like `ReviewCard.jsx` but with vendor controls):
  - Product thumbnail + name (linked to product) at top of each card
  - All `ReviewCard` fields
  - "Reply" button (opens `VendorReplyModal`) — changes to "Edit Reply" if already replied
- Pagination (20 per page)
- Empty state: "No reviews yet for your products."

**Admin `AdminReviewsPage.jsx`:**
- Filterable table:
  - Filter by: `is_hidden`, star rating (multi-select), product name (text search),
    vendor store name (text search), date range
  - Sort: newest | oldest | most helpful | lowest rating
- Table columns: product (thumbnail + name), reviewer name, rating stars, excerpt (50 chars),
  verified purchase badge, is_hidden status chip, vendor reply indicator (✓ if replied), date
- Row actions:
  - "Hide" → `PATCH /api/v1/admin/reviews/{id}/moderate/` `{is_hidden: true}`
  - "Restore" → same endpoint `{is_hidden: false}`
  - "Remove Vendor Reply" → `DELETE /api/v1/admin/reviews/{id}/reply/` (only shown if reply exists)
- Hidden reviews: grey background row + strikethrough on text
- Bulk action: select multiple → "Hide Selected" or "Restore Selected"

**Deliverable:** Customer can only submit a review if they have a DELIVERED order for that product.
Vendor can reply once per review and edit that reply any number of times.
Admin can hide/restore any review and remove any vendor reply. All states reflect immediately in UI.

---

### MODULE 7 — Recommendation System

**Goal:** All 5 recommendation types with modular strategy architecture, Redis caching,
and Celery background refresh.

#### Backend Tasks

**`apps/recommendations/models.py`:**
- `ProductView`: FK User (null=True for anonymous), FK Product, `viewed_at` (auto DateTimeField),
  `session_key` (CharField 64, blank=True — for anonymous tracking)
  - Index on `(product, viewed_at)` for trending queries
  - Index on `(user, viewed_at)` for personalized + recently-viewed queries
  - **Dedup rule**: if same `(user, product)` or `(session_key, product)` viewed within 30 minutes
    → `UPDATE viewed_at` (no new row); implement via `filter().first()` + conditional save in service

**`apps/recommendations/engine.py`:**
```python
from abc import ABC, abstractmethod

class RecommendationStrategy(ABC):
    @abstractmethod
    def get_recommendations(self, context: dict, limit: int) -> list[int]:
        """Returns list of product IDs, ranked by relevance. Never raises — returns [] on error."""
        ...

class RecommendationMixer:
    def __init__(self, strategies: list[tuple[RecommendationStrategy, float]]):
        self.strategies = strategies  # [(strategy, weight), ...]

    def get_mixed(self, context: dict, limit: int) -> list[int]:
        """
        1. For each strategy, fetch up to limit*2 IDs.
        2. score[product_id] += weight * (fetch_limit - position_index)
        3. Deduplicate, sort by composite score DESC.
        4. Return top `limit` IDs.
        """
        ...
```

**`apps/recommendations/strategies/content_based.py` (`ContentBasedStrategy`):**
```python
# context = {'product_id': int}
# 1. Load target product (category, specs, effective_price)
# 2. Fetch ACTIVE products in same category, exclude target
# 3. spec_score = (matching key-value pairs count) / max(len(target.specs), 1)
# 4. Price filter: keep 0.5× ≤ candidate.effective_price ≤ 2.0× target price
# 5. Sort: spec_score DESC → avg_rating DESC → created_at DESC
# 6. Cache result in Redis rec:similar:{product_id} for 6h
# Redis unavailable → compute live, skip cache write, log WARNING
```

**`apps/recommendations/strategies/co_occurrence.py` (`CoOccurrenceStrategy`):**
```python
# context = {'product_id': int}
# 1. Find OrderItem rows: product_id matches AND order.status in DELIVERED/SHIPPED/OUT_FOR_DELIVERY
# 2. Collect distinct order_ids
# 3. Count other product_id occurrences from those orders (GROUP BY product_id)
# 4. Sort by count DESC, return top limit IDs
# 5. Cache result in Redis rec:co_occur:{product_id} for 12h
```

**`apps/recommendations/strategies/recently_viewed.py` (`RecentlyViewedStrategy`):**
```python
# context = {'user_id': int} or {'session_key': str}
# 1. Query ProductView for user or session_key ORDER BY viewed_at DESC
# 2. Deduplicate: keep one entry per product_id (latest view)
# 3. Return up to limit product_ids (most recent first)
# No Redis cache — served from DB directly
```

**`apps/recommendations/strategies/personalized.py` (`PersonalizedStrategy`):**
```python
# context = {'user_id': int}
# Cold start: if user has <3 distinct purchased+viewed products → delegate to TrendingStrategy
# 1. user_vector = set of product_ids user has bought (DELIVERED) + viewed
# 2. neighbor_users = users sharing ≥2 product_ids with user_vector (via OrderItem)
# 3. neighbor_products = products ordered by neighbors NOT in user_vector
# 4. score = count of neighbors who ordered each neighbor_product
# 5. Sort DESC by score, return top limit IDs
# Cache in Redis rec:personal:{user_id} for 24h
```

**`apps/recommendations/strategies/trending.py` (`TrendingStrategy`):**
```python
# context = {} or {'category_id': int}
# window = now - timedelta(days=7)
# 1. purchase_count per product: OrderItem where order.created_at >= window, status != CANCELLED
# 2. view_count per product: ProductView where viewed_at >= window
# 3. score = (purchase_count * 0.6) + (view_count * 0.4)
# 4. If category_id: filter to that category
# 5. Exclude stock_quantity=0 products
# 6. Sort DESC by score, return top limit IDs
# Cache rec:trending:global or rec:trending:cat:{category_id} for 1h
```

**`apps/recommendations/tasks.py`** (Celery):
```python
@shared_task
def refresh_trending_cache():
    """Recompute global trending + all active categories. Store in Redis. TTL=1h."""
    TrendingStrategy().get_recommendations({}, limit=50)  # warms global cache
    for cat_id in Category.objects.filter(is_active=True).values_list('id', flat=True):
        TrendingStrategy().get_recommendations({'category_id': cat_id}, limit=20)

@shared_task
def refresh_co_occurrence_cache():
    """Recompute co-occurrence for top 500 products by order volume. Store in Redis. TTL=12h."""
    top_product_ids = (
        OrderItem.objects.values('product_id')
        .annotate(c=Count('id')).order_by('-c')[:500]
        .values_list('product_id', flat=True)
    )
    for pid in top_product_ids:
        CoOccurrenceStrategy().get_recommendations({'product_id': pid}, limit=20)

@shared_task
def refresh_personalized_cache(user_id: int):
    """Recompute personalized recs for one user. Store in Redis. TTL=24h."""
    PersonalizedStrategy().get_recommendations({'user_id': user_id}, limit=20)

@shared_task
def refresh_all_personalized():
    """Dispatch refresh_personalized_cache for every active user."""
    user_ids = CustomUser.objects.filter(is_active=True, role='CUSTOMER').values_list('id', flat=True)
    for uid in user_ids:
        refresh_personalized_cache.delay(uid)

@shared_task
def purge_old_product_views():
    """Delete ProductView records older than 90 days."""
    cutoff = now() - timedelta(days=90)
    ProductView.objects.filter(viewed_at__lt=cutoff).delete()
```

Celery beat schedule:
```python
CELERY_BEAT_SCHEDULE = {
    'refresh-trending-hourly':        {'task': '...refresh_trending_cache',      'schedule': 3600},
    'refresh-co-occurrence-12h':      {'task': '...refresh_co_occurrence_cache', 'schedule': 43200},
    'refresh-personalized-nightly':   {'task': '...refresh_all_personalized',    'schedule': crontab(hour=2, minute=0)},
    'purge-old-views-weekly':         {'task': '...purge_old_product_views',      'schedule': crontab(day_of_week=0, hour=3, minute=0)},
}
```

**`ProductViewService.track_view(user_or_session, product_id)`:**
```python
# 1. Determine filter: user_id or session_key
# 2. cutoff = now() - timedelta(minutes=30)
# 3. Dedup — DO NOT use update_or_create with a __gte lookup:
#    .get() is called internally and raises MultipleObjectsReturned if duplicates exist.
#    Use filter().first() instead:
#
#    existing = ProductView.objects.filter(
#        user_id=user_id, product_id=product_id, viewed_at__gte=cutoff
#    ).first()
#    if existing:
#        existing.viewed_at = now()
#        existing.session_key = session_key
#        existing.save(update_fields=['viewed_at', 'session_key'])
#    else:
#        ProductView.objects.create(
#            user_id=user_id, product_id=product_id,
#            viewed_at=now(), session_key=session_key
#        )
# 4. Invalidate recently-viewed for this user (no Redis key to invalidate — served live)
```

**Endpoints:**
```
GET  /api/v1/recommendations/similar/{product_slug}/
     → ContentBasedStrategy(product_id)                         public, limit=10 default max=20

GET  /api/v1/recommendations/frequently-bought-together/{product_slug}/
     → CoOccurrenceStrategy(product_id)                         public, limit=10 default max=20

GET  /api/v1/recommendations/recently-viewed/
     → RecentlyViewedStrategy(user_id or session_key)           reads X-Session-Key header

GET  /api/v1/recommendations/personalized/
     → PersonalizedStrategy(user_id) or TrendingStrategy        IsAuthenticated

GET  /api/v1/recommendations/trending/
     → TrendingStrategy({}) or TrendingStrategy({category_id})  public; ?category={id} optional

POST /api/v1/products/{slug}/track-view/
     → ProductViewService.track_view(…)                         public; reads X-Session-Key
```

All GET recommendation endpoints return `[ProductListSerializer data]` (default limit=10, max=20).
Accepts `?limit=N` query param.

#### Frontend Tasks

**`src/components/recommendation/RecommendationCarousel.jsx`:**

Props: `title` (string), `fetchFn` (async function → ProductListSerializer[]), `emptyMessage` (optional)

Behavior:
- **Lazy-load**: call `fetchFn` only when carousel scrolls into viewport
  (use `useIntersectionObserver` with 100px root margin — preloads just before visible)
- Loading state: row of 6 `Skeleton.jsx` cards (same aspect ratio as `ProductCard`)
- Empty state: hide entire section (including title) — don't show an empty carousel
- Error state: show `ErrorState` with "Retry" button that re-invokes `fetchFn`
- Scroll behavior: CSS `overflow-x: auto; scroll-snap-type: x mandatory`
  on the track; `scroll-snap-align: start` on each card
- Desktop: left ← / right → scroll buttons on edges (hidden when at start/end)
- Mobile: native touch swipe (no buttons); show scroll indicator dots below

**Placement map (with exact fetch functions):**

```jsx
// HomePage.jsx
<RecommendationCarousel
  title="Trending Now"
  fetchFn={() => recommendationService.getTrending({ limit: 10 })}
/>
<RecommendationCarousel
  title="Recommended For You"
  fetchFn={() => recommendationService.getPersonalized({ limit: 10 })}
  // Hidden entirely if not authenticated
  hidden={!isAuthenticated}
/>
<RecommendationCarousel
  title="Recently Viewed"
  fetchFn={() => recommendationService.getRecentlyViewed({ limit: 10 })}
  hidden={!isAuthenticated}
/>

// CategoryPage.jsx
<RecommendationCarousel
  title={`Trending in ${category.name}`}
  fetchFn={() => recommendationService.getTrending({ category_id: category.id, limit: 10 })}
/>

// ProductDetailPage.jsx — below tabs
<RecommendationCarousel
  title="Similar Products"
  fetchFn={() => recommendationService.getSimilar(slug, { limit: 10 })}
/>
<RecommendationCarousel
  title="Frequently Bought Together"
  fetchFn={() => recommendationService.getFrequentlyBoughtTogether(slug, { limit: 10 })}
/>

// CartPage.jsx + CartDrawer.jsx
<RecommendationCarousel
  title="You Might Also Need"
  fetchFn={() => recommendationService.getTrending({ limit: 10 })}
/>

// OrderConfirmPage.jsx
<RecommendationCarousel
  title="Other Customers Also Bought"
  fetchFn={() => recommendationService.getTrending({ limit: 10 })}
/>
```

**`src/services/recommendationService.js`:**
```js
export const recommendationService = {
  getTrending:                 (params) => axiosInstance.get('/recommendations/trending/', { params }),
  getPersonalized:             (params) => axiosInstance.get('/recommendations/personalized/', { params }),
  getRecentlyViewed:           (params) => axiosInstance.get('/recommendations/recently-viewed/', { params }),
  getSimilar:          (slug, params) => axiosInstance.get(`/recommendations/similar/${slug}/`, { params }),
  getFrequentlyBoughtTogether: (slug, params) =>
    axiosInstance.get(`/recommendations/frequently-bought-together/${slug}/`, { params }),
  trackView: (slug) => axiosInstance.post(`/products/${slug}/track-view/`),
}
```

**Track view:** In `ProductDetailPage`, on mount:
```js
useEffect(() => {
  const timer = setTimeout(() => recommendationService.trackView(slug), 500)
  return () => clearTimeout(timer)
}, [slug])
```
500ms debounce prevents duplicate calls on React StrictMode double-mount.

**`src/hooks/useIntersectionObserver.js`:**
```js
// Returns { ref, isIntersecting }
// Options: { threshold: 0, rootMargin: '100px' } (preload 100px before visible)
// Once isIntersecting becomes true, it stays true (no re-fetch on scroll out)
```

**Deliverable:** All 5 recommendation types fetched and displayed in correct locations.
Trending and personalized served from Redis cache. Carousels lazy-load on scroll-into-view.
Authenticated users see personalized + recently viewed; anonymous users see trending only.

---

### MODULE 8 — Compatibility Checker & PC Builder

**Goal:** Data-driven compatibility engine + interactive PC Builder UI with live rule checking.

#### Backend Tasks

**`apps/compatibility/models.py`:**
- `CompatibilityAttribute`: `name` (CharField unique, e.g. `"socket"`, `"form_factor"`),
  `description` (blank=True), `data_type` (TextChoices: `STRING` / `INTEGER` / `JSON_ARRAY`)
  — `data_type` informs the rule engine how to cast spec values before comparison
- `CompatibilityRule`:
  - `rule_name` (CharField unique, e.g. `"CPU_MOBO_SOCKET"`)
  - `category_a` (FK Category), `attribute_a` (FK CompatibilityAttribute)
  - `category_b` (FK Category), `attribute_b` (FK CompatibilityAttribute)
  - `rule_type` (TextChoices: `MATCH` / `MEMBER_OF` / `RANGE_MAX` / `POWER_CHECK`)
  - `severity` (TextChoices: `ERROR` / `WARNING`)
  - `description` (TextField — human-readable explanation shown in UI)
  - `is_active` (BooleanField default=True)
- `PCBuild`:
  - FK User (null=True for anonymous), `name` (CharField default="My Build"),
  - `is_public` (BooleanField default=False)
  - `share_token` (UUIDField default=uuid4, unique, db_index=True)
  - `total_price` (DecimalField computed and stored on save)
  - `status` (TextChoices: `DRAFT` / `COMPLETE`)
    — `COMPLETE` only when all required slots filled AND no ERROR CompatibilityResults
- `PCBuildItem`:
  - FK PCBuild (on_delete=CASCADE), FK Product (on_delete=SET_NULL, null=True)
  - `slot` (TextChoices: CPU/GPU/MOBO/RAM_1/RAM_2/PSU/CASE/COOLER/SSD_1/SSD_2/HDD)
  - `UniqueConstraint(fields=['build', 'slot'])`

**`apps/compatibility/services.py` (`CompatibilityService`):**

`check_build(build_id) → list[CompatibilityResult]`:
```python
@dataclass
class CompatibilityResult:
    rule_name: str
    description: str
    category_a: str
    category_b: str
    status: Literal['OK', 'WARNING', 'ERROR', 'INFO']
    message: str   # human-readable detail, shown in accordion
```

Full algorithm (see §2.10 for rule type logic):
1. Load build + all PCBuildItems with prefetched products and specs
2. Build `slot_map: dict[str, Product]` from items
3. For each `is_active=True` CompatibilityRule:
   - Resolve `product_a` and `product_b` by their categories from `slot_map`
   - If either is missing → `status = INFO`, message = "Select {category} to evaluate this rule"
   - If both present → call `_evaluate_rule(rule, product_a, product_b, slot_map)` → `(passed, detail_msg)`
   - `status = OK` if passed, else rule.severity (`ERROR` or `WARNING`)
4. Compute wattage summary (see §2.10 Wattage Display Logic) → append as extra result
5. Update `PCBuild.status = COMPLETE` if **no ERROR results** exist and all required slots are filled
   (WARNING and INFO results are acceptable — a build with a WARNING is still functional)
6. Return sorted results: ERROR first → WARNING → INFO → OK

`_evaluate_rule(rule, product_a, product_b, slot_map) → (bool, str)`:
```python
# MATCH:        product_a.specs[attr_a.name] == product_b.specs[attr_b.name]
# MEMBER_OF:    product_a.specs[attr_a.name] in product_b.specs[attr_b.name]  (b is JSON array)
# RANGE_MAX:    float(product_a.specs[attr_a.name]) <= float(product_b.specs[attr_b.name])
# POWER_CHECK:  _compute_total_tdp(slot_map) <= float(product_b.specs['wattage']) * 0.80
#
# Return (True, f"✓ {description}") on pass
# Return (False, specific failure message with actual values) on fail
# Example failure message: "CPU socket LGA1200 does not match Motherboard socket LGA1700"
```

`get_compatible_products(slot: str, build_dict: dict, page: int, search: str, page_size: int) → Page`:
```python
# 1. Determine category for this slot (use SLOTS mapping constant)
# 2. Base queryset: Product.objects.filter(category=slot_category, status='ACTIVE', stock_quantity__gt=0)
# 3. Apply search filter: name__icontains or brand__name__icontains
# 4. For each is_active CompatibilityRule involving this slot's category:
#      partner_slot = derive partner slot from rule and current slot
#      if partner_slot in build_dict and build_dict[partner_slot] is not None:
#        partner_product = Product.objects.get(pk=build_dict[partner_slot])
#        qs = _apply_rule_filter(qs, rule, slot, partner_product)
# 5. Return paginated queryset (StandardResultsPagination, ProductListSerializer)
```

`_compute_total_tdp(slot_map: dict) → int`:
```python
# cpu_tdp = slot_map['CPU'].specs.get('tdp_w', 0) if 'CPU' in slot_map else 0
# gpu_tdp = slot_map['GPU'].specs.get('tdp_w', 0) if 'GPU' in slot_map else 0
# ram_count = sum(1 for s in ['RAM_1','RAM_2'] if s in slot_map)
# ssd_count = sum(1 for s in ['SSD_1','SSD_2'] if s in slot_map)
# hdd_count = 1 if 'HDD' in slot_map else 0
# return cpu_tdp + gpu_tdp + (ram_count * 5) + (ssd_count * 5) + (hdd_count * 10) + 50
```

**Management command `seed_compatibility_rules`:**
Creates all 10 `CompatibilityRule` records from §2.10 table + required `CompatibilityAttribute`
records. Run before seeding products. Must be idempotent (use `get_or_create`).

**Endpoints:**
```
# Rule management (admin only)
GET    /api/v1/compatibility/rules/               (IsAdmin)
POST   /api/v1/compatibility/rules/
PATCH  /api/v1/compatibility/rules/{id}/
DELETE /api/v1/compatibility/rules/{id}/

# Compatibility check (public) — accepts build state in body
POST   /api/v1/compatibility/check/
       body: { "slots": { "CPU": product_id, "MOBO": product_id, ... } }
       response: { results: [CompatibilityResult], wattage: {...}, total_price: "৳ X,XX,XXX" }

# Compatible product filter (public)
GET    /api/v1/compatibility/products/{slot}/
       ?cpu_id=&mobo_id=&gpu_id=&psu_id=&case_id=&cooler_id=&ram1_id=&ram2_id=
       &ssd1_id=&ssd2_id=&hdd_id=&search=&page=&page_size=
       response: paginated ProductListSerializer

# Build management (authenticated)
GET    /api/v1/builds/                            (IsAuthenticated — user's builds list)
POST   /api/v1/builds/                            body: { name, slots: {...} }
GET    /api/v1/builds/{id}/
PATCH  /api/v1/builds/{id}/                       body: { name?, is_public?, slots?: {...} }
DELETE /api/v1/builds/{id}/

# Shared build (public)
GET    /api/v1/builds/share/{share_token}/
       response: PCBuild data + compatibility results + all products in slots
```

**`PCBuildSerializer`:**
- `id`, `name`, `status`, `total_price`, `share_token`, `is_public`, `created_at`
- `slots`: nested dict `{ CPU: ProductListSerializer|null, MOBO: ..., ... }` for all 11 slots
- `compatibility_results`: list of `CompatibilityResult` (computed fresh on each GET)

#### Frontend Tasks

**`src/pages/PCBuilder/PCBuilderPage.jsx`** — two-column layout (sticky right panel):

*Left column — Builder Panel (scrollable):*

11 slot cards rendered from a `SLOTS` constant:
```js
const SLOTS = [
  { key: 'CPU',    label: 'Processor',       category: 'CPU',          icon: Cpu,         required: true  },
  { key: 'MOBO',   label: 'Motherboard',      category: 'Motherboard',  icon: CircuitBoard, required: true  },
  { key: 'RAM_1',  label: 'Memory (Slot 1)',  category: 'RAM',          icon: MemoryStick, required: true  },
  { key: 'RAM_2',  label: 'Memory (Slot 2)',  category: 'RAM',          icon: MemoryStick, required: false },
  { key: 'GPU',    label: 'Graphics Card',    category: 'GPU',          icon: Monitor,     required: false },
  { key: 'PSU',    label: 'Power Supply',     category: 'Power Supply', icon: Zap,         required: true  },
  { key: 'CASE',   label: 'PC Case',          category: 'PC Case',      icon: Box,         required: true  },
  { key: 'COOLER', label: 'CPU Cooler',       category: 'CPU Cooler',   icon: Wind,        required: false },
  { key: 'SSD_1',  label: 'Storage (SSD 1)', category: 'SSD',          icon: HardDrive,   required: false },
  { key: 'SSD_2',  label: 'Storage (SSD 2)', category: 'SSD',          icon: HardDrive,   required: false },
  { key: 'HDD',    label: 'Storage (HDD)',    category: 'HDD',          icon: Database,    required: false },
]
```

**`SlotCard.jsx`** — two states:

*Empty state:*
- Dashed `border-2 border-dashed border-primary-700` border, `rounded-xl`, `primary-800` bg
- Icon (24px, `text-secondary`), label (`text-secondary`), "+ Select [label]" text (`accent-500`)
- `required` slots show a red `*` indicator in corner
- Click → open `ComponentSelectModal`

*Filled state:*
- Solid border (`accent-500`), `primary-800` bg
- 60×60 product thumbnail (rounded, object-cover), name (1-line clamp, `font-heading text-sm`)
- Effective price in `accent-400`
- Top-right: `×` remove button (circle, `danger` color on hover)
- Click body (not ×) → reopen `ComponentSelectModal` to swap product

**`ComponentSelectModal.jsx`:**
- Header: "Select [category]" + close button
- Search bar (`useDebounce(query, 300)`) — calls
  `GET /api/v1/compatibility/products/{slot}/?search=...&{current_build_params}`
  so only compatible products are shown
- Product list (image 48×48, name, brand, key spec preview, price, stock badge)
- Compatibility indicator per product: if all checks would pass with this selection → green `✓ Compatible`
- Paginated scroll (20 per page, load-more button)
- Click product → fill slot → close modal → trigger `check_build` re-evaluation
- "Browse All [category]" link (ignores compatibility filter) for advanced users

*Right column — Status Panel (sticky, `position: sticky; top: 1.5rem`):*

**`CompatibilityReport.jsx`:**
```
Accordion of CompatibilityResult items:
  • Sort order: ERROR (red, expanded) → WARNING (yellow, expanded) → INFO (grey, collapsed) → OK (green, collapsed)
  • Each row: status icon + rule description + detail message
  • ERROR rows: highlight conflicting spec values in bold red within message
  • INFO rows: greyed out, show "Add {category} to check"
  • All-OK state: show single green banner "✓ All checks passed — great build!"
```

**`WattageDisplay.jsx`:**
- Shows estimated wattage vs PSU headroom (see §2.10 wattage formula)
- Animated number counter on value change (Framer Motion)
- Progress bar showing load vs headroom capacity
- Color-coded per §2.10 thresholds (green / yellow / red)

**Build summary panel (below wattage):**
- Total build price: sum of all selected products' effective prices, formatted with `formatPrice()`
- Required slots checklist: green ✓ or red ○ per required slot
- "Build is incomplete" warning if any required slot is empty

**CTA buttons row (sticky bottom of right panel):**
- "Save Build" → `POST /api/v1/builds/` (if new) or `PATCH /api/v1/builds/{id}/`
  If not authenticated: open `LoginModal` instead
- "Share Build" → copies `/builds/share/{share_token}` to clipboard via `navigator.clipboard.writeText`
  Only enabled after build has been saved at least once; shows tooltip "Save first to share"
- "Add All to Cart" → calls `CartService.add_item` for each filled slot sequentially; shows
  progress toast ("Adding 7 items to cart..."); on complete invalidates cart query cache

**Build state management (React state + localStorage):**
```js
// usePCBuilder.js custom hook
const [build, setBuild] = useState(() => {
  const saved = localStorage.getItem('pccraft_build')
  return saved ? JSON.parse(saved) : { slots: {}, name: 'My Build' }
})

// Persist every change
useEffect(() => {
  localStorage.setItem('pccraft_build', JSON.stringify(build))
}, [build])

// On login: migrate localStorage build to DB
// On slot change: debounce 500ms then call check_build API
```

**Compatibility re-check trigger:**
- Every time a slot is filled or cleared: debounce 300ms → call
  `POST /api/v1/compatibility/check/` with current `{slots}` state
- Show loading spinner in `CompatibilityReport` during re-check
- On error: show `ErrorState` with "Retry" in the right panel

**`src/pages/PCBuilder/SharedBuildPage.jsx`:**
- Fetch `GET /api/v1/builds/share/{share_token}/` on mount
- Read-only version: all slots rendered as filled `SlotCard` (no click, no × remove)
- Full `CompatibilityReport` and `WattageDisplay` (read-only display)
- "Clone This Build" button (IsAuthenticated → POST `/api/v1/builds/` with same slots, new name
  "Copy of {original name}"; if not authenticated → show login modal)
- "Add All to Cart" button (same logic as builder page)
- SEO meta: page title = "{build.name} — PCCraft Build"

**`src/pages/Admin/AdminCompatibilityPage.jsx`:**
- Rules table: rule_name, category_a ↔ category_b, rule_type, severity badge, is_active toggle
- "Add Rule" button → form modal with all CompatibilityRule fields
- "Edit" → same modal pre-filled
- "Delete" → `ConfirmDialog` before delete
- "Toggle Active" → inline toggle (no confirm needed)
- Attribute management section below rules table:
  - List of `CompatibilityAttribute` records
  - Add / Edit / Delete with same modal pattern

**Deliverable:** PC Builder fully interactive. Compatibility re-checked on every slot change.
Compatible product filter shows only valid options. Wattage updated live with color-coded indicator.
Saved builds persist. Share link generates working public URL. Anonymous builds migrate to DB on login.

---

### MODULE 9 — Admin Panel

**Goal:** Full admin dashboard with analytics, user management, vendor approval,
product moderation, and all management screens.

#### Backend Tasks (`apps/dashboard/`)

**`views.py`** — all `IsAdmin`:
```
GET /api/v1/admin/analytics/overview/
    → { total_users, total_vendors, total_products, total_orders, total_revenue,
        pending_vendor_approvals, open_return_requests }

GET /api/v1/admin/analytics/orders-over-time/?range=7d|30d|90d
    → [ { date, order_count, revenue } ]

GET /api/v1/admin/analytics/top-products/?limit=10
    → [ { product_id, name, total_sold, revenue } ]

GET /api/v1/admin/analytics/top-vendors/?limit=10
    → [ { vendor_id, store_name, total_orders, revenue } ]

GET /api/v1/admin/analytics/category-distribution/
    → [ { category_name, product_count, order_count } ]

GET /api/v1/admin/analytics/revenue-over-time/?range=30d|90d
    → [ { date, revenue } ]
```

All analytics queries must use `created_at` filters and aggregate with Django ORM — no raw SQL.

**User management endpoints** (extend `apps/accounts/views.py`):
```
GET    /api/v1/admin/users/                  ?role=&is_active=&search=
PATCH  /api/v1/admin/users/{id}/suspend/     body: {reason}
PATCH  /api/v1/admin/users/{id}/activate/
DELETE /api/v1/admin/users/{id}/             (soft delete)
```

**Vendor approval endpoints:**
```
GET    /api/v1/admin/vendors/pending/
PATCH  /api/v1/admin/vendors/{id}/approve/
PATCH  /api/v1/admin/vendors/{id}/reject/    body: {reason}
PATCH  /api/v1/admin/vendors/{id}/request-info/ body: {message}
```

**Product moderation endpoints:**
```
GET    /api/v1/admin/products/               (all products including soft-deleted)
PATCH  /api/v1/admin/products/{slug}/hide/
PATCH  /api/v1/admin/products/{slug}/restore/
DELETE /api/v1/admin/products/{slug}/        (hard delete — requires admin confirmation)
```

**Order management endpoints** (extend `apps/orders/views.py`):
```
GET    /api/v1/admin/orders/                    ?status=&date_from=&date_to=&vendor=&search=
GET    /api/v1/admin/orders/{order_number}/     full read-only order detail (all items, all vendors)
```

#### Frontend Tasks

**`src/pages/Admin/AdminDashboardPage.jsx`:**
- 4 KPI cards row (total revenue, total orders, total users, pending approvals)
  each with % change from last period and trend icon
- Row 1: Recharts `LineChart` — Revenue over time (7d/30d/90d selector buttons)
- Row 2: Recharts `BarChart` — Orders by status | Recharts `PieChart` — Category distribution
- Row 3: `StatsTable` — Top 10 products | Top 10 vendors (tab toggle)

**`src/pages/Admin/AdminVendorApprovalPage.jsx`:**
- Tab bar: Pending | Approved | Rejected | Info Requested
- Table rows: business name, owner, email, submitted date, trade license preview button
- Expandable row on click: full business address, document viewer
  - PDF: embed in `<iframe>` or "Open PDF" link
  - Image: `<img>` with zoom on click
- "Approve" button (green), "Reject" button (red → opens modal with required reason textarea),
  "Request Info" button (yellow → opens modal with message textarea)

**`src/pages/Admin/AdminCategoriesPage.jsx`:**
- Left: tree view of categories with expand/collapse (use recursive `CategoryTreeNode.jsx`)
- Right: create/edit form (name → slug auto-preview, description, icon upload, parent selector)
- Delete: only if no products or subcategories linked (enforced server-side + client warning)

All other admin pages follow the same pattern: filterable table + action buttons + confirm dialogs.
Use shared `StatsTable.jsx` component where possible.

**`src/pages/Admin/AdminUsersPage.jsx`:**
- Filterable by role, is_active, search (name or email)
- Table: avatar, name, email, role badge, join date, active status chip
- Row actions: Suspend (with reason modal), Activate, Delete (soft, with ConfirmDialog)

**`src/pages/Admin/AdminProductsPage.jsx`:**
- Filterable by category, vendor, status, search (name or brand)
- Table: thumbnail, name, vendor, category, price, status chip (ACTIVE/DRAFT/ARCHIVED/HIDDEN)
- Row actions: Hide (sets status=HIDDEN), Restore (sets status=ACTIVE), Hard Delete (ConfirmDialog — permanent)

**`src/pages/Admin/AdminBrandsPage.jsx`:**
- Table: brand name, logo (16px), product count, created date
- Inline edit name; Delete with ConfirmDialog (blocked server-side if products exist)

**`src/pages/Admin/AdminOrdersPage.jsx`:**
- Filterable by status, date range, vendor
- Table: order ID, customer, total, status badge, date, item count
- Click row → `AdminOrderDetailPage` (read-only full order view)

**`src/pages/Admin/AdminReturnsPage.jsx`:**
- Filterable by status (PENDING / APPROVED / REJECTED / REFUNDED)
- Table: return ID, customer, product, return reason, date, status chip
- Row actions: Admin notes textarea (PATCH), mark REFUNDED (triggers Celery email task)

**`src/pages/Admin/AdminReviewsPage.jsx`:**
- **Fully aligned with expanded Module 6 frontend spec** — implemented in Module 6, referenced here
- Filterable by: `is_hidden`, star rating, product name (search), vendor store name (search), date range
- Sort: newest | oldest | most helpful | lowest rating
- Table: product thumbnail+name, reviewer name, rating stars, excerpt (50 chars),
  verified purchase badge, is_hidden chip, vendor reply indicator, date
- Row actions: Hide / Restore toggle; "Remove Vendor Reply" (shown only if reply exists)
- Hidden rows: grey background + strikethrough text
- Bulk action: select multiple → "Hide Selected" / "Restore Selected"

**`src/pages/Admin/AdminCompatibilityPage.jsx`:**
- **Fully aligned with expanded Module 8 frontend spec** — implemented in Module 8, referenced here
- Rules table: rule_name, category_a ↔ category_b, rule_type badge, severity badge, is_active toggle
- "Add Rule" / "Edit" buttons → modal with all `CompatibilityRule` fields
- "Delete" → ConfirmDialog before delete
- "Toggle Active" → inline toggle (no confirm needed)
- Attribute management section: list `CompatibilityAttribute` records; Add / Edit / Delete

**Admin layout:** wrap all admin pages in `Sidebar.jsx` (icon + label nav, collapsible)
with links to each admin section. Active link highlighted with `accent-500` border-left.
Admin sidebar links: Dashboard, Vendors, Users, Products, Brands, Categories, Orders, Returns,
Reviews, Compatibility

**Deliverable:** Full admin control panel functional. Analytics charts render real data.
Vendor approval workflow completes end-to-end. All moderation actions persist.

---

### MODULE 10 — Vendor Dashboard

**Goal:** Vendor-specific analytics overview and store management tools.

#### Backend Tasks

```
GET /api/v1/vendor/dashboard/overview/
    → { total_products, active_products, total_orders, pending_orders,
        shipped_orders, total_revenue_all_time, revenue_this_month,
        active_returns, low_stock_products_count }

GET /api/v1/vendor/dashboard/revenue-over-time/?range=7d|30d|90d
    → [ { date, revenue, order_count } ]

GET /api/v1/vendor/dashboard/top-products/?limit=5
    → [ { product_id, name, primary_image, total_sold, revenue, current_stock } ]

GET /api/v1/vendor/dashboard/low-stock/
    → [ { product_id, name, stock_quantity, low_stock_threshold } ]
```

All endpoints: `IsApprovedVendor`. Filter all queries by `vendor = request.user.vendor_profile`.

#### Frontend Tasks

**`src/pages/Vendor/VendorDashboardPage.jsx`:**
- KPI cards: Total Earnings, This Month Revenue, Pending Orders, Active Returns
- Recharts `LineChart`: Revenue over time (range selector)
- Top 5 products table (thumbnail, name, units sold, revenue)
- Low stock alert section: list of products below threshold with "Update Stock" quick link

**`src/pages/Vendor/VendorStorePage.jsx`:**
- Store info form: store name, description textarea, contact email
- Logo upload (square, max 2MB, preview)
- Banner upload (wide ratio, max 5MB, preview)
- Return policy text area (overrides platform default; leave blank to use platform default)
- Low stock threshold input (platform default: 5)
- Save button → `PATCH /api/v1/auth/profile/`  ← same endpoint used in Module 1; the view
  routes to `VendorProfileSerializer` for vendor users, which includes all store fields

**Vendor sidebar links:** Dashboard, My Store, Products, Orders, Returns, Reviews
- Reviews link → `/vendor/reviews` → `VendorReviewsPage.jsx`

**Deliverable:** Vendor dashboard shows real earnings and order data. Store settings editable.
Inventory alerts display accurately.

---

### MODULE 11 — Search & Filtering (Advanced)

**Goal:** Fast full-text search with URL-persisted filters, live suggestions, and search analytics.

#### Backend Tasks

**PostgreSQL full-text search setup:**
```python
# In apps/products/models.py — add to Product
from django.contrib.postgres.search import SearchVectorField
search_vector = SearchVectorField(null=True, blank=True)

# In apps/products/services.py — update search_vector on product save
from django.contrib.postgres.search import SearchVector
Product.objects.filter(pk=instance.pk).update(
    search_vector=SearchVector('name', weight='A') +
                  SearchVector('short_description', weight='B') +
                  SearchVector('description', weight='C')
)
```

Create a `GinIndex` on `search_vector` in the migration.

**`apps/recommendations/models.py`** — add:
- `SearchLog`: `query` (CharField), `user` (FK null=True), `results_count` (IntegerField),
  `timestamp` (auto DateTimeField)

**`GET /api/v1/search/` query params:**
```
q           Full-text search query
category    Comma-separated slugs (multi-select)
brand       Comma-separated slugs (multi-select)
min_price   Decimal
max_price   Decimal
in_stock    Boolean
discount    Boolean (has active discount)
min_rating  Float (1.0 – 5.0)
vendor      Vendor profile ID
ordering    relevance | newest | price | -price | rating | popularity
page        Integer
page_size   Integer (max 40)
```

Response: pagination envelope wrapping `ProductListSerializer` results.
Log every search query to `SearchLog` (async via Celery if performance matters).

**`GET /api/v1/search/suggestions/?q={query}` (public, no auth):**
- Returns up to 5 product names + up to 3 category names matching the query prefix
- Cache results in Redis for 5 minutes per query string

#### Frontend Tasks

**`src/components/layout/Navbar.jsx`** — enhanced search bar:
- `useDebounce(query, 300)` triggers suggestions fetch
- Dropdown below input:
  - "Recent Searches" (from localStorage, max 5, with × to remove)
  - "Suggestions" (from API): product names + category names
  - Click suggestion → navigate to `/search?q={suggestion}`
- Press Enter or click search icon → `/search?q={query}`

**`src/pages/Search/SearchResultsPage.jsx`:**
- All filter state in URL params (use `useSearchParams` hook)
- Filters sidebar (same as `ShopPage` + additional: discount toggle, min rating slider, vendor)
- Active filter chips row below search header: "Category: CPU ×", "Brand: Intel ×", etc.
  (click × to remove that filter from URL params)
- Header: "**47** results for **"ryzen 5"**" (query highlighted)
- `ProductGrid` with pagination
- No-results empty state: search icon, "No results for '{query}'",
  suggested categories or trending products below

**URL state example:**
```
/search?q=ryzen+5&category=cpu&brand=amd&min_price=15000&max_price=50000&in_stock=true&ordering=price
```

**Deliverable:** Search feels fast. All filters reflected in URL. Suggestions appear in 300ms.
No-results state shows helpful alternatives.

---

### MODULE 12 — Final Polish, Testing & Documentation

**Goal:** Harden the entire project: consistency, error states, testing, seeding, documentation.

#### Backend Tasks

1. **Consistency audit:** ensure all endpoints return `APIResponse` envelope without exception
2. **Request throttling** (add to `base.py`):
   ```python
   REST_FRAMEWORK = {
       'DEFAULT_THROTTLE_CLASSES': [
           'rest_framework.throttling.AnonRateThrottle',
           'rest_framework.throttling.UserRateThrottle',
       ],
       'DEFAULT_THROTTLE_RATES': {'anon': '100/hour', 'user': '1000/hour'}
   }
   ```
   Override with lower limits on auth endpoints: `30/hour` for login, `10/hour` for register.
3. **Service docstrings:** every method in every `services.py` must have a Google-style docstring
   explaining args, returns, and raises.
4. **Seed script** (`python manage.py seed_data`):
   - 1 admin user (`admin@pccraft.com` / `Admin@12345`)
   - 3 vendor users + approved `VendorProfile` records (store names: TechNova BD, GadgetHaven, ByteStore)
   - 18 categories (from §2.7 list) with realistic descriptions
   - 10 brands (Intel, AMD, NVIDIA, Samsung, Corsair, ASUS, Gigabyte, Seagate, Cooler Master, NZXT)
   - 10 compatibility attributes + 10 compatibility rules (all from §2.10)
   - 60 products distributed across categories (specs must be realistic and compatible with each other)
   - 20 customer users + order history + reviews
5. **Generate OpenAPI schema:** `python manage.py spectacular --file docs/openapi.yaml`

#### Frontend Tasks

1. **Error boundary:** wrap `App.jsx` router in `<ErrorBoundary>` (class component or
   `react-error-boundary` package) — shows `ErrorState.jsx` on uncaught renders
2. **Audit every page:** each must have:
   - ✅ Loading skeleton (while fetching)
   - ✅ Empty state (zero results)
   - ✅ Error state (fetch failed + "Retry" button that re-triggers query)
   - ✅ 404 handling (redirect to `NotFoundPage`)
3. **Form error mapping:** all forms must surface server validation errors
   (field-level errors from `errors` envelope key) next to the relevant input
4. **Responsive audit:** test at 375px (mobile), 768px (tablet), 1280px (desktop)
   — no horizontal scroll, no broken layouts
5. **Theme audit:** verify on every page that chrome elements (`Navbar`, `Sidebar`) use
   `bg-primary-900` / `bg-primary-800` with `text-inverse`, and all content areas use
   `bg-surface-100` / `bg-surface-50` with `text-primary`. No hardcoded hex colors anywhere —
   all must use Tailwind token classes defined in `globals.css`.
6. **Accessibility pass:** all interactive elements have `aria-label`; focus visible ring;
   keyboard navigation works for modals and dropdowns

#### Documentation Tasks

**`README.md`:**
```markdown
# PCCraft Marketplace
## Overview
## Tech Stack
## Prerequisites (Node 22+, Python 3.14+, PostgreSQL 18+, Redis 7+)
## Quick Start
### Backend
### Frontend
## Environment Variables (table of all .env keys)
## Seeding
## Running Tests
## Folder Structure (brief summary, link to ARCHITECTURE.md)
## Screenshots
## License
```

**`docs/ARCHITECTURE.md`:**
- Module dependency diagram (text-art or Mermaid)
- Key design decisions with rationale:
  - Why service layer (no logic in views)
  - Why JSONField for specs (vs EAV tables)
  - Why snapshot pattern for order addresses and prices
  - Why strategy pattern for recommendations
- Django app responsibility table

**`docs/API.md`:**
- Link to Swagger UI + ReDoc
- Endpoint groups table (Module → Base URL → Auth required → Notes)

**`docs/ERD.md`:**
- Mermaid `erDiagram` covering all 30+ models with field types and relationships

**Deliverable:** Production-ready, fully documented project. `seed_data` command populates
a realistic dataset. Every page handles all states correctly. Submission-ready.

---

## PART 4 — GLOBAL CODING STANDARDS

Enforce these in **every single module** without exception:

### Backend Standards

1. **No logic in views.** Views receive request, call service, return `APIResponse`. Period.
2. **Every endpoint has a permission class.** Nothing is accidentally public.
3. **Serializers validate first.** Data reaches the service only after serializer `.is_valid()`.
4. **All prices:** `DecimalField(max_digits=12, decimal_places=2)`. Never `FloatField`.
5. **All slugs:** auto-generated on model `save()` using `django.utils.text.slugify` +
   uniqueness suffix loop (`slug-1`, `slug-2`, ...).
6. **All image/file fields:** `upload_to` with dynamic path including `%Y/%m/`.
7. **No hardcoded strings.** Status values, roles, reasons → Django `TextChoices` enums.
8. **Atomic operations:** any service that modifies multiple tables uses `transaction.atomic()`.
9. **Query optimization:** use `select_related` for FK lookups, `prefetch_related` for M2M/reverse FK.
   Never N+1 queries. Use Django Debug Toolbar in development to verify.
10. **Tests:** every service method has at least one test in `tests/test_services.py`.

### Frontend Standards

11. **Every data-fetching component:** must render `Skeleton` (loading), `EmptyState` (no data),
    `ErrorState` with retry (request failed).
12. **Never store sensitive data in localStorage.** Access token lives in Zustand memory only.
    Refresh token in an `httpOnly` cookie (set by backend) or also in Zustand if cookies unavailable.
13. **No inline styles.** 100% Tailwind utility classes. Custom CSS only for keyframe animations.
14. **No magic strings.** Route paths from `routePaths.js`. Status values from `constants.js`.
15. **React Query keys:** use structured array keys: `['products', 'list', filters]`,
    `['products', 'detail', slug]` for predictable cache invalidation.
16. **Forms:** React Hook Form + Zod. Server errors mapped to form field errors via `setError()`.
17. **All currency amounts:** formatted with `formatPrice(amount)` → "৳ 1,25,000" (BD locale).
18. **Component props:** destructured, with JSDoc comment for non-obvious props.

### Git Standards

19. **Branch per module:** `module/00-scaffolding`, `module/01-auth`, ..., `module/12-polish`
20. **Commit messages:** `[Module N] Short imperative description` (e.g. `[Module 2] Add ProductService with stock validation`)
21. **Never commit:** `.env`, `__pycache__/`, `node_modules/`, `media/`, `*.pyc`
22. **`.gitignore`** must cover all of the above from day 1 (created in Module 0).

---

*End of PCCraft Marketplace Master Specification — Version 4.0*
*This document supersedes all previous versions. Do not reference v1.0, v2.0, or v3.0.*
