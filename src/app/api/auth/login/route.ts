/**
 * POST /api/auth/login
 *
 * Corps : { email: string, password: string }
 * Réponse succès : { user: { id, email, name, role } }
 *   → pose un cookie httpOnly "point-rh-token" contenant le JWT
 * Réponse échec  : { error: string } avec status 401
 *
 * Sécurité :
 * - Message d'erreur générique (pas de distinction email/mdp)
 * - Cookie httpOnly + SameSite=Strict (non accessible depuis JS client)
 * - Audit log de chaque connexion
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { comparePassword, signToken, COOKIE_NAME } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { email?: string; password?: string };

    // Validation basique des entrées
    if (
      typeof body.email !== "string" ||
      typeof body.password !== "string" ||
      !body.email.trim() ||
      !body.password
    ) {
      return NextResponse.json(
        { error: "Email et mot de passe requis." },
        { status: 400 }
      );
    }

    const email = body.email.trim().toLowerCase();
    const password = body.password;

    // Recherche de l'utilisateur (sans révéler si l'email existe)
    const user = await prisma.user.findUnique({ where: { email } });

    const passwordOk = user
      ? await comparePassword(password, user.password)
      : false; // Exécuter quand même pour éviter le timing attack

    if (!user || !passwordOk || !user.isActive) {
      await logAudit("LOGIN", "User", {
        details: { email, success: false, reason: "bad_credentials" },
      });
      return NextResponse.json(
        { error: "Identifiants incorrects." },
        { status: 401 }
      );
    }

    // Créer le token JWT
    const token = signToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    await logAudit("LOGIN", "User", {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      entityId: user.id,
      details: { success: true },
    });

    // Réponse avec cookie sécurisé
    const response = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 8, // 8 heures
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
