import { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './lib/theme';
import { Layout } from './components/layout/Layout';
import { DataContext, loadAllData, type AppData } from './lib/data-loader';

// Lazy-load page components for route-level code splitting
const Overview = lazy(() => import('./pages/Overview').then((m) => ({ default: m.Overview })));
const FundDetail = lazy(() => import('./pages/FundDetail').then((m) => ({ default: m.FundDetail })));
const Vendors = lazy(() => import('./pages/Vendors').then((m) => ({ default: m.Vendors })));
const Buildings = lazy(() => import('./pages/Buildings').then((m) => ({ default: m.Buildings })));
const CreditCards = lazy(() => import('./pages/CreditCards').then((m) => ({ default: m.CreditCards })));
const Timeline = lazy(() => import('./pages/Timeline').then((m) => ({ default: m.Timeline })));
const Search = lazy(() => import('./pages/Search').then((m) => ({ default: m.Search })));

function LoadingScreen() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      height: '100vh', gap: 16, color: 'var(--color-muted-foreground, #6b7280)',
    }}>
      <div style={{
        width: 32, height: 32, border: '3px solid currentColor', borderTopColor: 'transparent',
        borderRadius: '50%', animation: 'spin 0.8s linear infinite',
      }} />
      <p style={{ fontSize: 14 }}>Loading financial data...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      height: '100vh', gap: 8, color: '#ef4444',
    }}>
      <p style={{ fontWeight: 600 }}>Failed to load data</p>
      <p style={{ fontSize: 12, opacity: 0.7 }}>{message}</p>
    </div>
  );
}

function PageFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}>
      <div style={{
        width: 24, height: 24, border: '2px solid var(--color-muted-foreground, #6b7280)',
        borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  );
}

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAllData().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorScreen message={error} />;
  if (!data) return <LoadingScreen />;

  return (
    <ThemeProvider>
      <DataContext.Provider value={data}>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Suspense fallback={<PageFallback />}><Overview /></Suspense>} />
              <Route path="/fund/:code" element={<Suspense fallback={<PageFallback />}><FundDetail /></Suspense>} />
              <Route path="/vendors" element={<Suspense fallback={<PageFallback />}><Vendors /></Suspense>} />
              <Route path="/buildings" element={<Suspense fallback={<PageFallback />}><Buildings /></Suspense>} />
              <Route path="/credit-cards" element={<Suspense fallback={<PageFallback />}><CreditCards /></Suspense>} />
              <Route path="/timeline" element={<Suspense fallback={<PageFallback />}><Timeline /></Suspense>} />
              <Route path="/search" element={<Suspense fallback={<PageFallback />}><Search /></Suspense>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </DataContext.Provider>
    </ThemeProvider>
  );
}
