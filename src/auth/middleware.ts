import type { Request, Response, NextFunction } from "express";
import { verifyClerkToken } from "./clerk-token-verifier.js";
import { env } from "../config/env.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

// Extend Express Request to carry auth info
declare global {
  namespace Express {
    interface Request {
      auth?: AuthInfo;
    }
  }
}

/**
 * Required bearer auth middleware.
 * Returns 401 with WWW-Authenticate header if token is missing or invalid.
 * The WWW-Authenticate header points MCP clients to OAuth discovery.
 */
export async function requireBearerAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    res
      .status(401)
      .set(
        "WWW-Authenticate",
        `Bearer resource_metadata="${env.MCP_SERVER_URL}/.well-known/oauth-protected-resource"`
      )
      .json({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message: "Authentication required",
        },
      });
    return;
  }

  try {
    req.auth = await verifyClerkToken(token);
    next();
  } catch (err) {
    console.warn("Bearer token verification failed:", err);
    res
      .status(401)
      .set(
        "WWW-Authenticate",
        `Bearer resource_metadata="${env.MCP_SERVER_URL}/.well-known/oauth-protected-resource", error="invalid_token"`
      )
      .json({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message: "Invalid or expired token",
        },
      });
  }
}
