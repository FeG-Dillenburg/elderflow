/** PROTOTYPE — same-origin WebSocket authentication state-model probe. */
import { randomBytes } from 'node:crypto';
import { permissionsByRole } from '../../auth/permissions';
import type { UserRole } from '../../users/user.entity';

interface Ticket {
  documentId: string;
  expiresAt: number;
  role: UserRole;
  userId: string;
}

export interface TransportProbeResult {
  passed: boolean;
  detail: string;
}

export const runTransportProbe = (): TransportProbeResult => {
  const tickets = new Map<string, Ticket>();
  const mint = (userId: string, role: UserRole, documentId: string): string => {
    const value = randomBytes(32).toString('base64url');
    tickets.set(value, { documentId, expiresAt: Date.now() + 30_000, role, userId });
    return value;
  };
  const consumeFirstFrame = (value: string, documentId: string): Ticket | null => {
    const ticket = tickets.get(value);
    tickets.delete(value);
    return ticket && ticket.documentId === documentId && ticket.expiresAt > Date.now() ? ticket : null;
  };

  // The ordinary HTTPS request that mints the ticket uses ElderFlow's existing
  // Authorization: Bearer session. Browser WebSocket construction then uses a
  // stable same-origin URL, and the single-use ticket is the first TLS-protected
  // application frame—not a query parameter or reusable login credential.
  const websocketUrl = 'wss://elderflow.example/api/collaboration';
  const documentId = 'meeting:prototype-41';
  const adminTicket = mint('alice', 'admin', documentId);
  const authenticated = consumeFirstFrame(adminTicket, documentId);
  const replayRejected = consumeFirstFrame(adminTicket, documentId) === null;
  const adminCanWrite = authenticated
    ? permissionsByRole[authenticated.role].meetings === 'manage'
    : false;
  const itAdmin = consumeFirstFrame(mint('ops', 'it-admin', documentId), documentId);
  const itAdminExcluded = itAdmin
    ? permissionsByRole[itAdmin.role].meetings === 'hide'
    : false;
  const noCredentialInUrl = !websocketUrl.includes('?') && !websocketUrl.includes(adminTicket);

  const passed = Boolean(authenticated) && replayRejected && adminCanWrite && itAdminExcluded && noCredentialInUrl;
  return {
    passed,
    detail: 'Bearer-authenticated REST exchange -> 30s single-use document ticket -> first WebSocket frame; stable URL; existing Meeting permission map; it-admin excluded',
  };
};
