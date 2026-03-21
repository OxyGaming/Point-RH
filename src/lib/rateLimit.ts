/**
 * Rate limiter en mémoire (singleton par processus Node.js).
 *
 * Usage :
 *   const result = rateLimit("login", ip, { max: 5, windowMs: 60_000 });
 *   if (!result.ok) return NextResponse.json({ error: "Trop de tentatives" }, { status: 429 });
 *
 * Notes :
 * - Adapté à un déploiement single-instance (Next.js dev, PM2 single worker, etc.)
 * - En multi-instance (cluster, edge), remplacer par un store Redis/Upstash.
 * - Le nettoyage automatique (GC toutes les 5 min) évite les fuites mémoire.
 */

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

// Nettoyage périodique des entrées expirées
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }, 5 * 60 * 1000);
}

export interface RateLimitOptions {
  /** Nombre maximum de requêtes autorisées dans la fenêtre. */
  max: number;
  /** Durée de la fenêtre en millisecondes. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Vérifie et incrémente le compteur pour une clé donnée.
 * @param namespace  Catégorie (ex: "login")
 * @param identifier Identifiant du client (ex: adresse IP)
 * @param opts       Fenêtre et limite
 */
export function rateLimit(
  namespace: string,
  identifier: string,
  opts: RateLimitOptions
): RateLimitResult {
  const key = `${namespace}:${identifier}`;
  const now = Date.now();

  let entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    entry = { count: 1, resetAt: now + opts.windowMs };
    store.set(key, entry);
    return { ok: true, remaining: opts.max - 1, resetAt: entry.resetAt };
  }

  entry.count += 1;

  if (entry.count > opts.max) {
    return { ok: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { ok: true, remaining: opts.max - entry.count, resetAt: entry.resetAt };
}
