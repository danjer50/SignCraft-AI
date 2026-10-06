import { lazy, useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { ProjectProvider } from './context/ProjectContext';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ResultPage } from './pages/ResultPage';
import { StudioPage } from './pages/StudioPage';

/**
 * The customer journey (home, studio, result) stays in the main bundle so it renders
 * immediately. Professional and admin workspaces are separate, lazily loaded chunks: they
 * are never part of the simple customer flow and never delay it.
 */
const ProfessionalPage = lazy(() => import('./pages/ProfessionalPage').then((module) => ({ default: module.ProfessionalPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })));

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

/** Self-contained root: providers live here so the app cannot be mounted without them. */
export default function App() {
  return (
    <LanguageProvider>
      <ProjectProvider>
        <BrowserRouter><RoutedApp /></BrowserRouter>
      </ProjectProvider>
    </LanguageProvider>
  );
}
