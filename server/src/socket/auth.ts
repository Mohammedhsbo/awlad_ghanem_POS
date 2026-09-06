/**
 * TASK-008-API: WebSocket authentication middleware.
 *
 * Authenticates Socket.IO connections using the same JWT access token
 * as HTTP routes. The token can be provided in:
 *   - handshake.auth.token  (recommended — not exposed in URL)
 *   - handshake.headers.authorization  (Bearer <token>)
 *
 * Unauthenticated connections are rejected with an error event.
 * The authenticated user is attached to socket.data.user so handlers
 * can read it without repeating auth logic.
 */
import type { Socket } from 'socket.io';
import { verifyToken } from '../utils/jwt.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { Action, Language, Resource } from '@motorcycle-system/shared-types';

export type SocketUser = {
  id: string;
  name: string;
  email: string;
  branchId: string | null;
  roleName: string;
  permissions: Array<{ resource: Resource; action: Action }>;
};

/**
 * Returns a Socket.IO use-middleware that validates JWT tokens and
 * populates socket.data.user on success.
 *
 * @param prisma  — PrismaService instance (injected by the gateway)
 */
export function createSocketAuthMiddleware(prisma: PrismaService) {
  return async (socket: Socket, next: (err?: Error) => void) => {
    try {
      const raw: unknown =
        socket.handshake.auth?.token ??
        (socket.handshake.headers.authorization?.startsWith('Bearer ')
          ? socket.handshake.headers.authorization.slice(7)
          : undefined);

      if (typeof raw !== 'string' || !raw) {
        return next(new Error('UNAUTHORIZED: token required'));
      }

      let payload;
      try {
        payload = verifyToken(raw, 'access');
      } catch {
        return next(new Error('UNAUTHORIZED: invalid or expired token'));
      }

      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          role: { include: { permissions: true } },
        },
      });

      if (!user || !user.isActive) {
        return next(new Error('UNAUTHORIZED: user not found or inactive'));
      }

      const socketUser: SocketUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        branchId: user.branchId,
        roleName: user.role.name,
        permissions: user.role.permissions.map((p) => ({
          resource: p.resource as Resource,
          action: p.action as Action,
        })),
      };

      (socket.data as { user: SocketUser }).user = socketUser;
      next();
    } catch (err) {
      next(err instanceof Error ? err : new Error('UNAUTHORIZED: internal error'));
    }
  };
}
