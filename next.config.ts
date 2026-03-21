import type { NextConfig } from "next";

/**
 * En-têtes de sécurité HTTP appliqués à toutes les routes.
 *
 * CSP (Content-Security-Policy) :
 * - default-src 'self'          → tout bloqué sauf même origine par défaut
 * - script-src 'self' 'unsafe-inline' 'unsafe-eval' → requis par Next.js (inline hydration)
 * - style-src 'self' 'unsafe-inline' → requis par Tailwind CSS (inline styles)
 * - img-src 'self' data:         → images locales + data URIs (icônes)
 * - font-src 'self'              → polices locales uniquement
 * - connect-src 'self'           → XHR/fetch vers même origine uniquement
 * - frame-ancestors 'none'       → empêche le framing (clickjacking)
 *
 * À ajuster si vous intégrez des CDN externes (fonts.googleapis.com, etc.)
 */
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
      // Next.js requiert unsafe-inline pour l'hydratation et unsafe-eval en dev
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],

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
