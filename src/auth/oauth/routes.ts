import { Router } from "express";
import { env } from "../../config/env.js";
import { registerClient, getClient, storePendingAuth, getPendingAuth, removePendingAuth } from "./client-store.js";

const clerkBaseUrl = `https://${env.CLERK_DOMAIN}`;
let clerkMeta: Record<string, unknown> | null = null;

async function getClerkMeta() {
  if (!clerkMeta) {
    const res = await fetch(`${clerkBaseUrl}/.well-known/openid-configuration`);
    clerkMeta = (await res.json()) as Record<string, unknown>;
  }
  return clerkMeta;
}

export const oauthRouter = Router();

oauthRouter.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json({
    resource: env.MCP_SERVER_URL,
    authorization_servers: [env.MCP_SERVER_URL],
    scopes_supported: ["openid", "profile", "email"],
    bearer_methods_supported: ["header"],
  });
});

oauthRouter.get("/.well-known/oauth-authorization-server", async (_req, res) => {
  try {
    const meta = await getClerkMeta();
    res.json({
      issuer: env.MCP_SERVER_URL,
      authorization_endpoint: `${env.MCP_SERVER_URL}/oauth/authorize`,
      token_endpoint: `${env.MCP_SERVER_URL}/oauth/token`,
      jwks_uri: meta.jwks_uri,
      registration_endpoint: `${env.MCP_SERVER_URL}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["openid", "profile", "email"],
      token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
    });
  } catch {
    res.status(502).json({ error: "Failed to fetch auth server metadata" });
  }
});

oauthRouter.post("/oauth/register", (req, res) => {
  res.status(201).json(registerClient(req.body));
});

oauthRouter.get("/oauth/register/:clientId", (req, res) => {
  const client = getClient(req.params.clientId as string);
  client ? res.json(client) : res.status(404).json({ error: "Client not found" });
});

oauthRouter.get("/oauth/authorize", async (req, res) => {
  const meta = await getClerkMeta();
  const state = req.query.state as string;
  const redirectUri = req.query.redirect_uri as string;

  if (state && redirectUri) storePendingAuth(state, redirectUri);

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value !== "string") continue;
    if (key === "client_id") params.set(key, env.CLERK_CLIENT_ID);
    else if (key === "redirect_uri") params.set(key, `${env.MCP_SERVER_URL}/oauth/callback`);
    else params.set(key, value);
  }

  res.redirect(`${meta.authorization_endpoint}?${params}`);
});

oauthRouter.get("/oauth/callback", (req, res) => {
  const { state, code, error } = req.query as Record<string, string>;
  const pending = state ? getPendingAuth(state) : null;

  if (!pending || !state) {
    res.status(400).json({ error: "Unknown state" });
    return;
  }

  const url = new URL(pending.redirectUri);
  if (error) {
    url.searchParams.set("error", error);
    if (req.query.error_description) url.searchParams.set("error_description", req.query.error_description as string);
  } else {
    url.searchParams.set("code", code);
  }
  url.searchParams.set("state", state);
  res.redirect(url.toString());
});

oauthRouter.post("/oauth/token", async (req, res) => {
  try {
    const meta = await getClerkMeta();
    const source = new URLSearchParams(Object.entries(req.body).map(([k, v]) => [k, String(v)]));

    const body = new URLSearchParams();
    for (const [key, value] of source) {
      if (key === "client_id") body.set(key, env.CLERK_CLIENT_ID);
      else if (key === "client_secret") body.set(key, env.CLERK_CLIENT_SECRET);
      else if (key === "redirect_uri") body.set(key, `${env.MCP_SERVER_URL}/oauth/callback`);
      else body.set(key, value);
    }
    if (!body.has("client_id")) body.set("client_id", env.CLERK_CLIENT_ID);
    if (!body.has("client_secret")) body.set("client_secret", env.CLERK_CLIENT_SECRET);

    const tokenRes = await fetch(meta.token_endpoint as string, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    res.status(tokenRes.status).json(await tokenRes.json());
    const s = source.get("state");
    if (s) removePendingAuth(s);
  } catch {
    res.status(500).json({ error: "Token exchange failed" });
  }
});
