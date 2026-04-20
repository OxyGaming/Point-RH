/**
 * Utilitaires d'authentification
 * - Signature / vérification JWT (jsonwebtoken, côté serveur Node.js)
 * - Hachage / comparaison de mots de passe (bcryptjs)
 */
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const DEV_FALLBACK_SECRET = "point-rh-dev-secret-change-in-production";

/**
 * Résout le secret JWT — évaluation paresseuse, mémorisée.
 *
 * Pourquoi paresseux : Next.js exécute les modules au moment de la collecte
 * des pages en build avec NODE_ENV=production, même quand le serveur n'est
 * pas encore démarré. Un throw au chargement du module casserait le build
 * quel que soit le secret fourni au runtime. On diffère donc la validation
 * au premier signToken/verifyToken effectif.
 *
 * - En production : exige un JWT_SECRET d'au moins 32 caractères, différent
 *   des valeurs par défaut connues. Échec rapide à la première opération
 *   JWT plutôt qu'une compromise silencieuse.
 * - Hors production : utilise le fallback de dev si aucune variable n'est
 *   définie, pour laisser les tests et le dev local fonctionner.
 */
let cachedSecret: string | null = null;
function getJwtSecret(): string {
  if (cachedSecret !== null) return cachedSecret;

  const fromEnv = process.env.JWT_SECRET;

  if (process.env.NODE_ENV === "production") {
    if (!fromEnv) {
      throw new Error(
        "JWT_SECRET manquant : la variable d'environnement JWT_SECRET est obligatoire en production."
      );
    }
    if (fromEnv === DEV_FALLBACK_SECRET) {
      throw new Error(
        "JWT_SECRET laissé à la valeur de dev : générez un secret aléatoire (>= 32 caractères) pour la production."
      );
    }
    if (/changez[-_ ]moi|change[-_ ]in[-_ ]production|changeme/i.test(fromEnv)) {
      throw new Error(
        "JWT_SECRET contient une valeur placeholder (\"changez-moi\"/\"change-in-production\") : utilisez un secret réel."
      );
    }
    if (fromEnv.length < 32) {
      throw new Error(
        `JWT_SECRET trop court (${fromEnv.length} caractères) : fournissez au moins 32 caractères aléatoires en production.`
      );
    }
    cachedSecret = fromEnv;
    return cachedSecret;
  }

  cachedSecret = fromEnv ?? DEV_FALLBACK_SECRET;
  return cachedSecret;
}

const JWT_EXPIRES_IN = "8h";
export const COOKIE_NAME = "point-rh-token";

export type TokenPayload = {
  id: string;
  email: string;
  name: string;
  role: string; // "ADMIN" | "USER"
};

// ─── JWT ──────────────────────────────────────────────────────────────────────

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, getJwtSecret()) as TokenPayload;
}

// ─── Mots de passe ────────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
