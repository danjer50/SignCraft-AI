import { lazy, useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { RequireRole } from './components/RequireRole';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { ProjectProvider } from './context/ProjectContext';
import type { AccountRole } from './domain/auth';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ResultPage } from './pages/ResultPage';
import { StudioPage } from './pages/StudioPage';

/**
 * The customer journey (home, studio, result) stays in the main bundle so it renders
 * immediately. Professional and admin workspaces are separate, lazily loaded chunks: they
 * are never part of the simple customer flow and never delay it.
 */
const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const ProPage = lazy(() => import('./pages/ProPage').then((module) => ({ default: module.ProPage })));
const ProfessionalPage = lazy(() => import('./pages/ProfessionalPage').then((module) => ({ default: module.ProfessionalPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })));

/**
 * Private areas. The role list here is a UX gate only: the matching server endpoints authorize the
 * same roles on every request, so the routes cannot be widened from the browser.
 */
const PRO_ROLES: readonly AccountRole[] = ['PRO', 'ADMIN'];
const ADMIN_ROLES: readonly AccountRole[] = ['ADMIN'];

/**
 * Cached probe: `behavior: 'instant'` is a valid `ScrollBehavior` only since Safari 15.4, and
 * older engines throw a `TypeError` on an unknown enum value instead of ignoring it.
 * `null` = not probed yet, `true`/`false` = the options form works / must not be used again.
 */
let instantScrollSupported: boolean | null = null;

/**
 * Scroll restoration for route changes. It runs *outside* the page-level error boundary, so a
 * browser or an embedded frame that refuses `window.scrollTo` must never be able to unmount the
 * whole app into the boot crash screen: every step degrades to the next, then to nothing.
 */
function scrollToShowTop(): void {
  if (instantScrollSupported !== false) {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      instantScrollSupported = true;
      return;
    } catch {
      instantScrollSupported = false;
    }
  }
  try {
    window.scrollTo(0, 0);
    return;
  } catch {
    // A sandboxed frame can block scrolling entirely; that is a cosmetic loss only.
  }
  try {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  } catch {
    // Nothing else to try: keep the page interactive instead of reporting an error.
  }
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { scrollToShowTop(); }, [pathname]);
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
          {/* One login page for every role; the server decides where each account goes next. */}
          <Route path="login" element={<LoginPage />} />
          {/* Public overview of the future professional workflow (unchanged). */}
          <Route path="professional" element={<ProfessionalPage />} />
          {/* Authenticated areas. */}
          <Route path="pro" element={<RequireRole roles={PRO_ROLES}><ProPage /></RequireRole>} />
          <Route path="admin" element={<RequireRole roles={ADMIN_ROLES}><AdminPage /></RequireRole>} />
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
        <AuthProvider>
          <BrowserRouter><RoutedApp /></BrowserRouter>
        </AuthProvider>
      </ProjectProvider>
    </LanguageProvider>
  );
}
