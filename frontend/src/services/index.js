// Barrel export for service modules. Prefer importing the specific service
// (e.g. `import { authService } from '@services/authService'`) to keep tree
// shaking effective; this barrel exists for convenience only.
export { default as api, axiosInstance } from '@services/axiosInstance';
export { authService } from '@services/authService';
export { productService } from '@services/productService';
export { categoryService } from '@services/categoryService';
export { brandService } from '@services/brandService';
export { cartService } from '@services/cartService';
export { wishlistService } from '@services/wishlistService';
export { orderService } from '@services/orderService';
export { returnService } from '@services/returnService';
export { reviewService } from '@services/reviewService';
export { recommendationService } from '@services/recommendationService';
export { compatibilityService } from '@services/compatibilityService';
export { searchService } from '@services/searchService';
export { vendorService } from '@services/vendorService';
export { adminService } from '@services/adminService';
export { tokenStorage } from '@services/tokenStorage';