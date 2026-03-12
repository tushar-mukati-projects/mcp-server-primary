import type { Request, Response, NextFunction } from "express";
import { verifyClerkToken } from "./clerk-token-verifier.js";
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
 * Optional bearer auth middleware.
 * If a valid Bearer token is present, sets req.auth.
 * If no token or invalid token, continues without auth (does NOT reject).
 * Protected tools check req.auth themselves.
 */
export async function optionalBearerAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    next();
    return;
  }

  try {
    req.auth = await verifyClerkToken(token);
  } catch (err) {
    // Token invalid — continue without auth, tool handlers will decide
    console.warn("Bearer token verification failed:", err);
  }

  next();
}
