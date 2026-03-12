import { randomUUID } from "crypto";
import type {
  OAuthClientInformationFull,
  OAuthClientMetadata,
} from "@modelcontextprotocol/sdk/shared/auth.js";

const clients = new Map<string, OAuthClientInformationFull>();

// Maps: local client_id -> { redirect_uri the MCP client registered }
// So we can map back after Clerk redirects to our callback
const pendingAuths = new Map<
  string,
  { localClientId: string; originalRedirectUri: string; state: string }
>();

export function getClient(
  clientId: string
): OAuthClientInformationFull | undefined {
  return clients.get(clientId);
}

export function registerClient(
  metadata: OAuthClientMetadata
): OAuthClientInformationFull {
  const clientId = randomUUID();
  const clientSecret = randomUUID();

  const clientInfo: OAuthClientInformationFull = {
    ...metadata,
    client_id: clientId,
    client_secret: clientSecret,
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };

  clients.set(clientId, clientInfo);
  return clientInfo;
}

export function storePendingAuth(
  state: string,
  localClientId: string,
  originalRedirectUri: string
) {
  pendingAuths.set(state, { localClientId, originalRedirectUri, state });
}

export function getPendingAuth(state: string) {
  return pendingAuths.get(state);
}

export function removePendingAuth(state: string) {
  pendingAuths.delete(state);
}
