/**
 * Helpers de session côté serveur (Server Components & API routes).
 *
 * Usage dans un Server Component :
 *   const session = await getSession();
 *
 * Usage dans une API route pour protéger un endpoint :
 *   const session = await requireAuth(request);   // 401 si non connecté
 *   const session = await requireAdmin(request);  // 403 si non admin
 */
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME, type TokenPayload } from "./auth";

export type SessionUser = TokenPayload;

// ─── Server Component helper ──────────────────────────────────────────────────

/** Retourne l'utilisateur courant ou null si non authentifié. */
export async function getSession(): Promise<SessionUser | null> {
  try {
    const store = await cookies();
    const token = store.get(COOKIE_NAME)?.value;
    if (!token) return null;
    return verifyToken(token);
  } catch {
    return null;
  }
}

// ─── API route helpers ────────────────────────────────────────────────────────

type AuthResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

/** Lit le token depuis le cookie de la requête (API routes). */
function getTokenFromRequest(req: NextRequest): string | null {
  return req.cookies.get(COOKIE_NAME)?.value ?? null;
}

/**
 * Vérifie l'authentification dans une API route.
 * Retourne { ok: true, user } ou { ok: false, response: 401 }.
 */
export function checkAuth(req: NextRequest): AuthResult {
  const token = getTokenFromRequest(req);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Non authentifié. Veuillez vous connecter." },
        { status: 401 }
      ),
    };
  }
  try {
    const user = verifyToken(token);
    return { ok: true, user };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Session expirée ou invalide." },
        { status: 401 }
      ),
    };
  }
}

/**
 * Vérifie que l'utilisateur est admin dans une API route.
 * Retourne { ok: true, user } ou { ok: false, response: 401/403 }.
 */
export function checkAdmin(req: NextRequest): AuthResult {
  const auth = checkAuth(req);
  if (!auth.ok) return auth;
  if (auth.user.role !== "ADMIN") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Accès refusé. Droits administrateur requis." },
        { status: 403 }
      ),
    };
  }
  return auth;
}
