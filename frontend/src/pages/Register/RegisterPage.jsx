// RegisterPage — thin re-export shim.
//
// The auth flow was split into separate customer and vendor entry
// points (CustomerRegisterPage / VendorRegisterPage). This file is
// kept as a default export so legacy route imports (`import
// RegisterPage from '@/pages/Register/RegisterPage'`) continue to
// work; it simply renders the customer page.
import CustomerRegisterPage from './CustomerRegisterPage';

export default CustomerRegisterPage;
