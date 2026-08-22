import { Routes, Route } from 'react-router-dom';
import SiteHeader from './components/layout/SiteHeader.jsx';
import SiteFooter from './components/layout/SiteFooter.jsx';
import Home from './pages/Home.jsx';
import Pricing from './pages/Pricing.jsx';
import Install from './pages/Install.jsx';

export default function App() {
  return (
    <div className="site">
      <SiteHeader />
      <main className="site-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/install" element={<Install />} />
        </Routes>
      </main>
      <SiteFooter />
    </div>
  );
}
