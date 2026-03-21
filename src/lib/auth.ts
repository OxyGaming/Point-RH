/**
 * Utilitaires d'authentification
 * - Signature / vérification JWT (jsonwebtoken, côté serveur Node.js)
 * - Hachage / comparaison de mots de passe (bcryptjs)
 */
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET ?? "point-rh-dev-secret-change-in-production";
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
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

// ─── Mots de passe ────────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
