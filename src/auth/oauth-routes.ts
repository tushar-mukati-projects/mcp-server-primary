import { Router, type Request, type Response } from "express";
import { env } from "../config/env.js";
import {
  getClient,
  registerClient,
  storePendingAuth,
  getPendingAuth,
  removePendingAuth,
} from "./clients-store.js";

const router = Router();
const clerkBaseUrl = `https://${env.CLERK_DOMAIN}`;

// Cache Clerk's OIDC metadata
let clerkMetadataCache: Record<string, unknown> | null = null;

async function getClerkMetadata(): Promise<Record<string, unknown>> {
  if (clerkMetadataCache) return clerkMetadataCache;
  const res = await fetch(
    `${clerkBaseUrl}/.well-known/openid-configuration`
  );
  clerkMetadataCache = (await res.json()) as Record<string, unknown>;
  return clerkMetadataCache;
}

// OAuth Protected Resource Metadata (RFC 9728)
router.get(
  "/.well-known/oauth-protected-resource",
  (_req: Request, res: Response) => {
    res.json({
      resource: env.MCP_SERVER_URL,
      authorization_servers: [env.MCP_SERVER_URL],
      scopes_supported: ["openid", "profile", "email"],
      bearer_methods_supported: ["header"],
    });
  }
);

// OAuth Authorization Server Metadata (RFC 8414)
// Points authorize/token to OUR proxy endpoints, not directly to Clerk
router.get(
  "/.well-known/oauth-authorization-server",
  async (_req: Request, res: Response) => {
    try {
      const oidcMeta = await getClerkMetadata();

      res.json({
        issuer: env.MCP_SERVER_URL,
        authorization_endpoint: `${env.MCP_SERVER_URL}/oauth/authorize`,
        token_endpoint: `${env.MCP_SERVER_URL}/oauth/token`,
        jwks_uri: oidcMeta.jwks_uri,
        registration_endpoint: `${env.MCP_SERVER_URL}/oauth/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        scopes_supported: ["openid", "profile", "email"],
        token_endpoint_auth_methods_supported: [
          "client_secret_post",
          "client_secret_basic",
        ],
      });
    } catch (err) {
      console.error("Failed to fetch Clerk OIDC metadata:", err);
      res.status(502).json({ error: "Failed to fetch auth server metadata" });
    }
  }
);

// Dynamic Client Registration (RFC 7591)
router.post("/oauth/register", (req: Request, res: Response) => {
  try {
    const clientInfo = registerClient(req.body);
    res.status(201).json(clientInfo);
  } catch (err) {
    console.error("Client registration failed:", err);
    res.status(400).json({ error: "Invalid registration request" });
  }
});

// Get client info
router.get("/oauth/register/:clientId", (req: Request, res: Response) => {
  const clientId = req.params.clientId as string;
  const client = getClient(clientId);
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  res.json(client);
});

// Proxy: /oauth/authorize → Clerk's authorization endpoint
// Swaps our local client_id with the real Clerk client_id
router.get("/oauth/authorize", async (req: Request, res: Response) => {
  try {
    const oidcMeta = await getClerkMetadata();
    const clerkAuthEndpoint = oidcMeta.authorization_endpoint as string;

    const localClientId = req.query.client_id as string;
    const state = req.query.state as string;
    const redirectUri = req.query.redirect_uri as string;

    // Store the mapping so we know where to redirect back
    if (state && localClientId && redirectUri) {
      storePendingAuth(state, localClientId, redirectUri);
    }

    // Build Clerk authorize URL with real Clerk client_id
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (key === "client_id") {
        // Swap with real Clerk client_id
        params.set(key, env.CLERK_CLIENT_ID);
      } else if (key === "redirect_uri") {
        // Redirect back to our callback proxy
        params.set(key, `${env.MCP_SERVER_URL}/oauth/callback`);
      } else if (typeof value === "string") {
        params.set(key, value);
      }
    }

    res.redirect(`${clerkAuthEndpoint}?${params.toString()}`);
  } catch (err) {
    console.error("Authorize proxy error:", err);
    res.status(500).json({ error: "Failed to proxy authorize request" });
  }
});

// Callback: receives code from Clerk, redirects back to MCP client
router.get("/oauth/callback", (req: Request, res: Response) => {
  const state = req.query.state as string;
  const code = req.query.code as string;
  const error = req.query.error as string;

  if (error) {
    const pending = state ? getPendingAuth(state) : null;
    if (pending) {
      removePendingAuth(state);
      const redirectUrl = new URL(pending.originalRedirectUri);
      redirectUrl.searchParams.set("error", error);
      if (req.query.error_description) {
        redirectUrl.searchParams.set(
          "error_description",
          req.query.error_description as string
        );
      }
      redirectUrl.searchParams.set("state", state);
      res.redirect(redirectUrl.toString());
    } else {
      res.status(400).json({ error, error_description: req.query.error_description });
    }
    return;
  }

  if (!state || !code) {
    res.status(400).json({ error: "Missing state or code" });
    return;
  }

  const pending = getPendingAuth(state);
  if (!pending) {
    res.status(400).json({ error: "Unknown state parameter" });
    return;
  }

  // Don't remove pending yet — token exchange will also need to know about this client
  // Redirect back to the MCP client's original redirect_uri with the code
  const redirectUrl = new URL(pending.originalRedirectUri);
  redirectUrl.searchParams.set("code", code);
  redirectUrl.searchParams.set("state", state);
  res.redirect(redirectUrl.toString());
});

// Proxy: /oauth/token → Clerk's token endpoint
// Swaps client credentials
router.post("/oauth/token", async (req: Request, res: Response) => {
  try {
    const oidcMeta = await getClerkMetadata();
    const clerkTokenEndpoint = oidcMeta.token_endpoint as string;

    // Build form body, swapping client credentials
    const body = new URLSearchParams();
    const source =
      typeof req.body === "string"
        ? new URLSearchParams(req.body)
        : req.body instanceof URLSearchParams
          ? req.body
          : new URLSearchParams(
              Object.entries(req.body).map(([k, v]) => [k, String(v)])
            );

    for (const [key, value] of source) {
      if (key === "client_id") {
        body.set(key, env.CLERK_CLIENT_ID);
      } else if (key === "client_secret") {
        body.set(key, env.CLERK_CLIENT_SECRET);
      } else if (key === "redirect_uri") {
        // Must match what we sent to Clerk
        body.set(key, `${env.MCP_SERVER_URL}/oauth/callback`);
      } else {
        body.set(key, value);
      }
    }

    // If client_id/secret not in body, add them
    if (!body.has("client_id")) {
      body.set("client_id", env.CLERK_CLIENT_ID);
    }
    if (!body.has("client_secret")) {
      body.set("client_secret", env.CLERK_CLIENT_SECRET);
    }

    const tokenRes = await fetch(clerkTokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const tokenData = await tokenRes.json();
    res.status(tokenRes.status).json(tokenData);

    // Clean up pending auth
    const state = source.get("state");
    if (state) removePendingAuth(state);
  } catch (err) {
    console.error("Token proxy error:", err);
    res.status(500).json({ error: "Failed to proxy token request" });
  }
});

export { router as oauthRouter };
