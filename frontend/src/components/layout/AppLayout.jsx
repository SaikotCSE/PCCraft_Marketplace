// AppLayout — wraps every route in <Navbar /> + <main /> + <Footer />.
// Also hosts cross-cutting UI: Toaster, online/offline banner, global
// modal portal root.
import { useEffect } from 'react';
import { Outlet, ScrollRestoration } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import Navbar from '@components/layout/Navbar';
import Footer from '@components/layout/Footer';
import { useUIStore } from '@context/useUIStore';

const AppLayout = () => {
  const { isOnline, setOnline } = useUIStore();

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnline]);

  return (
    <div className="flex min-h-screen flex-col bg-surface-100 font-sans text-text-primary">
      <Navbar />

      {!isOnline && (
        <div
          role="alert"
          className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-sm text-warning"
        >
          You are offline. Some features may be unavailable.
        </div>
      )}

      <main className="flex-1">
        <Outlet />
      </main>

      <Footer />

      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            borderRadius: '8px',
            background: '#0F172A',
            color: '#F8FAFC',
            fontSize: '14px',
          },
        }}
      />

      <ScrollRestoration />
    </div>
  );
};

export default AppLayout;
