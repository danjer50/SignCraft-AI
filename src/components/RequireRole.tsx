import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isAuthorizedForRole, type AccountRole } from '../domain/auth';
import { useAuth } from '../context/AuthContext';
import { AccessDeniedPanel } from './AccessDeniedPanel';
import { PageSkeleton } from './PageSkeleton';

interface RequireRoleProps {
  roles: readonly AccountRole[];
  children: ReactNode;
}

/**
 * Route protection for the private areas.
 *
 * - While the session is being read: a skeleton, never a blank screen.
 * - Not signed in (or the auth service is unreachable): the single login page, remembering where
 *   the visitor was headed.
 * - Signed in with the wrong role: a proper forbidden panel that offers their own area.
 *
 * This is a UX gate only. The real authorization is server-side: every admin/pro API re-checks the
 * signed-in role, so bypassing this component gains nothing.
 */
export function RequireRole({ roles, children }: RequireRoleProps) {
  const { loading, status, role } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="page-container page-pad">
        <PageSkeleton />
      </div>
    );
  }

  if (status !== 'authenticated' || !isAuthorizedForRole(role, roles)) {
    if (status === 'authenticated') return <AccessDeniedPanel />;
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return <>{children}</>;
}
