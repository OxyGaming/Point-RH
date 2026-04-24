import type { NextConfig } from "next";

/**
 * En-têtes de sécurité HTTP appliqués à toutes les routes.
 *
 * CSP (Content-Security-Policy) :
 * - default-src 'self'           → tout bloqué sauf même origine par défaut
 * - script-src 'self' 'unsafe-inline' [+ 'unsafe-eval' en dev uniquement]
 *                                 Next.js a besoin d'unsafe-inline pour l'hydratation ;
 *                                 'unsafe-eval' n'est requis que par le HMR en dev.
 * - style-src 'self' 'unsafe-inline' → requis par Tailwind CSS (inline styles)
 * - img-src 'self' data: blob:   → images locales + data URIs (icônes) + blob (canvas)
 * - font-src 'self'              → polices locales uniquement
 * - connect-src 'self'           → XHR/fetch vers même origine uniquement
 * - frame-ancestors 'none'       → empêche le framing (clickjacking)
 * - upgrade-insecure-requests    → force HTTPS pour tout sous-contenu (prod)
 *
 * À ajuster si vous intégrez des CDN externes (fonts.googleapis.com, etc.)
 */
const isProd = process.env.NODE_ENV === "production";

const scriptSrc = isProd
  ? "script-src 'self' 'unsafe-inline'"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    // Empêche les navigateurs anciens d'inférer le Content-Type
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Interdit le chargement dans une iframe (protection clickjacking)
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Désactive l'XSS auditor obsolète des vieux navigateurs
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  {
    // Limite les informations de référence envoyées aux tiers
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Restreint les API navigateur utilisables
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    // HSTS : force HTTPS pendant 1 an (activer uniquement en production HTTPS)
    // Conditionnel : appliqué ici mais sans preload pour rester flexible
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      ...(isProd ? ["upgrade-insecure-requests"] : []),
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],

  experimental: {
    serverActions: {
      // Clé stable entre builds : évite les erreurs "Failed to find Server Action"
      // quand les clients ont une ancienne version en cache après redéploiement.
      // Définir NEXT_SERVER_ACTIONS_ENCRYPTION_KEY dans .env (openssl rand -base64 32).
      encryptionKey: process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,
    },
  },

  async headers() {
    return [
      {
        // Appliquer à toutes les routes
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
