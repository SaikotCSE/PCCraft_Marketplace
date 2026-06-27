# Frontend Service Layer

HTTP boundary between the React app and the Django REST API. Every endpoint
the backend exposes has a corresponding method here.

## Files

| File | Purpose |
|------|---------|
| `axiosInstance.js` | Configured axios client with base URL, interceptors, refresh, unwrap |
| `tokenStorage.js` | localStorage wrapper for access/refresh tokens |
| `authService.js` | Login, register, logout, refresh, password reset |
| `productService.js` | Product list/detail/trending, product search |
| `categoryService.js` | Category tree + detail |
| `brandService.js` | Brand list + detail |
| `cartService.js` | Cart CRUD (fetch, add, update, remove, clear) |
| `wishlistService.js` | Wishlist fetch/add/remove |
| `orderService.js` | Order list/detail/checkout/cancel |
| `returnService.js` | Return requests, status |
| `reviewService.js` | Product reviews + vendor replies |
| `recommendationService.js` | For-you, trending, co-occurrence, compatibility |
| `compatibilityService.js` | PC build compatibility check, slot lookup, save/load build |
| `searchService.js` | Full-text search + autocomplete suggestions |
| `vendorService.js` | Public vendor profile + vendor self-service |
| `adminService.js` | Admin dashboard, vendor approval, user/order moderation |

## Conventions

- Every service returns the unwrapped `data` field (or `data.data` when the
  backend uses the standard envelope). Callers never see axios internals.
- Path names mirror the backend URL names exactly (e.g. `/cart/items/`).
- `params` objects are forwarded as query strings; do not pre-encode.
- Auth: `axiosInstance` attaches the access token, refreshes on 401, and
  redirects to `/login` when refresh fails.
- Errors: rejected promises carry `error.response.data` for the caller to
  inspect. No service swallows errors silently.

## Usage

```js
import { productService } from '@services/productService';

const { results } = await productService.list({ category: 'gpu', page: 2 });
```