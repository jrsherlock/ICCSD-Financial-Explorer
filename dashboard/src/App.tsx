import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './lib/theme';
import { Layout } from './components/layout/Layout';
import { Overview } from './pages/Overview';
import { FundDetail } from './pages/FundDetail';
import { Vendors } from './pages/Vendors';
import { Buildings } from './pages/Buildings';
import { CreditCards } from './pages/CreditCards';
import { Timeline } from './pages/Timeline';
import { Search } from './pages/Search';

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Overview />} />
            <Route path="/fund/:code" element={<FundDetail />} />
            <Route path="/vendors" element={<Vendors />} />
            <Route path="/buildings" element={<Buildings />} />
            <Route path="/credit-cards" element={<CreditCards />} />
            <Route path="/timeline" element={<Timeline />} />
            <Route path="/search" element={<Search />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
