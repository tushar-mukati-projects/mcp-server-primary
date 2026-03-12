import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "./token-verifier.js";
import { env } from "../config/env.js";

const resourceMetadataUrl = `${env.MCP_SERVER_URL}/.well-known/oauth-protected-resource`;

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7).trim()
    : null;

  if (!token) {
    res.status(401)
      .set("WWW-Authenticate", `Bearer resource_metadata="${resourceMetadataUrl}"`)
      .json({ jsonrpc: "2.0", error: { code: -32001, message: "Authentication required" } });
    return;
  }

  try {
    req.auth = await verifyToken(token);
    next();
  } catch {
    res.status(401)
      .set("WWW-Authenticate", `Bearer resource_metadata="${resourceMetadataUrl}", error="invalid_token"`)
      .json({ jsonrpc: "2.0", error: { code: -32001, message: "Invalid token" } });
  }
}
