import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { useLanguage } from './context/LanguageContext';
import { AdminPage } from './pages/AdminPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProfessionalPage } from './pages/ProfessionalPage';
import { ResultPage } from './pages/ResultPage';
import { StudioPage } from './pages/StudioPage';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo({ top: 0, behavior: 'instant' }), [pathname]);
  return null;
}

function RoutedApp() {
  const { direction } = useLanguage();
  return (
    <div className="locale-root" dir={direction}>
      <ScrollToTop />
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="studio" element={<StudioPage />} />
          <Route path="result" element={<ResultPage />} />
          <Route path="professional" element={<ProfessionalPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </div>
  );
}

export default function App() {
  return <BrowserRouter><RoutedApp /></BrowserRouter>;
}
