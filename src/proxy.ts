/**
 * Middleware Next.js — Protection des routes par authentification et rôle.
 *
 * Routes publiques  : /auth/login (page), /api/auth/* (login/logout/me)
 * Routes protégées  : tout le reste nécessite un cookie JWT valide
 * Routes admin only : /admin/*, /api/admin/*, /api/users/*
 *
 * Le middleware est exécuté CÔTÉ SERVEUR avant chaque requête :
 * aucun contournement possible depuis le client.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";

// Chemins accessibles sans authentification
const PUBLIC_PATHS = [
  "/auth/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
];

// Chemins réservés aux administrateurs
const ADMIN_PATHS = [
  "/admin/",
  "/api/admin/",
  "/api/users",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isAdminPath(pathname: string): boolean {
  return ADMIN_PATHS.some((p) => pathname.startsWith(p));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Toujours autoriser les ressources statiques Next.js
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname === "/"
  ) {
    return NextResponse.next();
  }

  // Routes publiques : pas de vérification
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Lire et vérifier le token JWT
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return redirectToLogin(request, pathname);
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    // Token invalide ou expiré → redirection login avec cookie effacé
    const res = redirectToLogin(request, pathname);
    res.cookies.delete(COOKIE_NAME);
    return res;
  }

  // Vérification admin pour les routes réservées
  if (isAdminPath(pathname) && payload.role !== "ADMIN") {
    // Pour les API routes : 403 JSON
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Accès refusé. Droits administrateur requis." },
        { status: 403 }
      );
    }
    // Pour les pages : redirection vers l'accueil
    return NextResponse.redirect(new URL("/import", request.url));
  }

  // Ajouter l'utilisateur dans les headers pour les Server Components
  const response = NextResponse.next();
  response.headers.set("x-user-id", payload.id);
  response.headers.set("x-user-email", payload.email);
  response.headers.set("x-user-role", payload.role);
  return response;
}

function redirectToLogin(request: NextRequest, from: string): NextResponse {
  // Pour les API routes : retourner 401 JSON
  if (from.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Non authentifié. Veuillez vous connecter." },
      { status: 401 }
    );
  }
  // Pour les pages : rediriger vers /auth/login
  const url = request.nextUrl.clone();
  url.pathname = "/auth/login";
  url.searchParams.set("from", from);
  return NextResponse.redirect(url);
}

export { proxy as middleware };
export const config = {
  matcher: [
    /*
     * Appliquer le middleware à toutes les routes sauf :
     * - _next/static, _next/image, favicon.ico, fichiers statiques
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
