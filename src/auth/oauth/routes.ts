import { Router } from "express";
import { env } from "../../config/env.js";

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
    const metaRes = await fetch(`${env.KEYCLOAK_ISSUER}/.well-known/oauth-authorization-server`);
    const metadata = (await metaRes.json()) as Record<string, unknown>;

    const realmMatch = env.KEYCLOAK_ISSUER.replace(/\/$/, "").split("/realms/");
    const realmPath = realmMatch.length > 1 ? `/realms/${realmMatch[1]}` : "";

    metadata.registration_endpoint =
      `${env.MCP_SERVER_URL}/keycloak-proxy${realmPath}/clients-registrations/openid-connect`;

    metadata.scopes_supported = ["openid", "profile", "email"];

    res.json(metadata);
  } catch {
    res.status(502).json({ error: "Failed to fetch Keycloak metadata" });
  }
});

oauthRouter.all("/keycloak-proxy/{*path}", async (req, res) => {
  const rawPath = req.params.path;
  const path = Array.isArray(rawPath) ? rawPath.join("/") : (rawPath ?? "");

  if (!path.includes("clients-registrations")) {
    res.status(404).send("Only client registration endpoint is proxied");
    return;
  }

  const keycloakBaseUrl = env.KEYCLOAK_ISSUER.split("/realms/")[0];
  const targetUrl = `${keycloakBaseUrl}/${path}`;

  try {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (k.toLowerCase() !== "host" && typeof v === "string") headers[k] = v;
    }

    const proxyRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body),
    });

    const data = await proxyRes.text();
    res.status(proxyRes.status);
    proxyRes.headers.forEach((v, k) => res.set(k, v));
    res.send(data);
  } catch {
    res.status(502).json({ error: "Proxy request failed" });
  }
});
