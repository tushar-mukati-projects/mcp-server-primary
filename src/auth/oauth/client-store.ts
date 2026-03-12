import { randomUUID } from "crypto";

const clients = new Map<string, Record<string, unknown>>();
const pendingAuths = new Map<string, { redirectUri: string }>();

export function registerClient(metadata: Record<string, unknown>) {
  const id = randomUUID();
  const info = {
    ...metadata,
    client_id: id,
    client_secret: randomUUID(),
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };
  clients.set(id, info);
  return info;
}

export function getClient(id: string) {
  return clients.get(id);
}

export function storePendingAuth(state: string, redirectUri: string) {
  pendingAuths.set(state, { redirectUri });
}

export function getPendingAuth(state: string) {
  return pendingAuths.get(state);
}

export function removePendingAuth(state: string) {
  pendingAuths.delete(state);
}
