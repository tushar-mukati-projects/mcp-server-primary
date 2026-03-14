import { Router } from "express";
import { config } from "../../config/config.js";

export const oauthRouter = Router();

oauthRouter.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json({
    resource: config.serverUrl,
    authorization_servers: [config.serverUrl],
    scopes_supported: ["openid", "profile", "email"],
    bearer_methods_supported: ["header"],
  });
});

oauthRouter.get("/.well-known/oauth-authorization-server", async (_req, res) => {
  try {
    const oidcRes = await fetch(`${config.auth.clerk.issuer}/.well-known/openid-configuration`);
    const metadata = (await oidcRes.json()) as Record<string, unknown>;

    metadata.registration_endpoint = `${config.serverUrl}/oauth/register`;
    metadata.scopes_supported = ["openid", "profile", "email"];

    res.json(metadata);
  } catch {
    res.status(502).json({ error: "Failed to fetch Clerk metadata" });
  }
});

oauthRouter.post("/oauth/register", async (req, res) => {
  const { redirect_uris, client_name } = req.body;

  try {
    const clerkRes = await fetch("https://api.clerk.com/v1/oauth_applications", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.auth.clerk.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: client_name || "mcp-client",
        callback_url: redirect_uris?.[0] || "http://localhost",
        scopes: "openid profile email",
      }),
    });

    if (!clerkRes.ok) {
      const error = await clerkRes.text();
      res.status(clerkRes.status).json({ error: "Clerk registration failed", details: error });
      return;
    }

    const data = (await clerkRes.json()) as Record<string, unknown>;

    res.status(201).json({
      client_id: data.client_id,
      client_secret: data.client_secret,
      client_name: data.name,
      redirect_uris: redirect_uris || [data.callback_url],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
    });
  } catch {
    res.status(500).json({ error: "Failed to register client" });
  }
});
