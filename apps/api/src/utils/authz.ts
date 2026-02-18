import type { FastifyRequest } from 'fastify';

export type MembershipRole = 'admin' | 'manager' | 'analyst';

export type PermissionKey =
  | 'content.review'
  | 'content.publish'
  | 'cms.configure'
  | 'rbac.manage'
  | 'projects.manage';

export function requireAuth(req: FastifyRequest): NonNullable<FastifyRequest['auth']> {
  if (!req.auth) {
    const error = new Error('Unauthorized');
    (error as Error & { statusCode: number }).statusCode = 401;
    throw error;
  }
  return req.auth;
}

export function requireRole(req: FastifyRequest, allowed: MembershipRole[]): NonNullable<FastifyRequest['auth']> {
  const auth = requireAuth(req);
  if (!allowed.includes(auth.role)) {
    const error = new Error('Forbidden');
    (error as Error & { statusCode: number }).statusCode = 403;
    throw error;
  }
  return auth;
}

export function requirePermission(req: FastifyRequest, permission: PermissionKey): NonNullable<FastifyRequest['auth']> {
  const auth = requireAuth(req);

  const role = auth.role;
  const allowed = (() => {
    if (role === 'admin') return true;

    if (role === 'manager') {
      return permission === 'content.review' || permission === 'cms.configure' || permission === 'projects.manage';
    }

    // analyst (MVP): read-only for most management actions
    return false;
  })();

  if (!allowed) {
    const error = new Error('Forbidden');
    (error as Error & { statusCode: number }).statusCode = 403;
    throw error;
  }

  return auth;
}
