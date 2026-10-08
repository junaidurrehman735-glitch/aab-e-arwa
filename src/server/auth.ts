import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { queryOne, queryAll, runQuery } from './db.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'aab-e-arwa-secure-enterprise-jwt-key-991284';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role_id: string;
  role_name: string;
  phone?: string;
  status: string;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

export function generateToken(user: AuthenticatedUser): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role_id: user.role_id,
      role_name: user.role_name,
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    // Check if user still exists and is active
    const user = queryOne<AuthenticatedUser>(
      `SELECT u.id, u.name, u.email, u.role_id, r.name as role_name, u.phone, u.status
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = ?;`,
      [decoded.id]
    );

    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: 'User account is inactive or disabled' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session token' });
  }
}

export function checkPermission(module: string, action: 'can_view' | 'can_create' | 'can_edit' | 'can_approve' | 'can_delete') {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Owner / Super Admin always has full access
    if (req.user.role_id === 'role-owner') {
      return next();
    }

    const perm = queryOne(
      `SELECT ${action} as allowed FROM permissions WHERE role_id = ? AND module = ?;`,
      [req.user.role_id, module]
    );

    if (!perm || perm.allowed !== 1) {
      return res.status(403).json({
        error: `Access Denied: You do not have '${action.replace('can_', '')}' permission for module '${module}'`,
      });
    }

    next();
  };
}

export function logAudit(
  user: AuthenticatedUser | undefined,
  action: string,
  module: string,
  recordRef: string,
  details: string,
  req?: Request
) {
  try {
    const id = `aud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '') : '';
    runQuery(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_ref, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        id,
        user ? user.id : 'system',
        user ? user.name : 'System',
        action,
        module,
        recordRef,
        details,
        String(ip),
      ]
    );
  } catch (err) {
    console.error('Audit logging failed:', err);
  }
}
