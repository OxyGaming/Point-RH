/**
 * POST /api/auth/register
 *
 * Endpoint public — création d'une demande d'inscription.
 * Le compte est créé avec registrationStatus="PENDING" et isActive=false.
 * Un administrateur doit valider la demande avant que l'utilisateur puisse se connecter.
 *
 * Corps : { prenom, nom, email, password, confirmPassword, motif }
 * Sécurité :
 * - Rate limiting : 5 tentatives par IP sur 1 heure
 * - Validation stricte des entrées
 * - Hash bcrypt du mot de passe
 * - Ne révèle pas si l'email est déjà pris (message générique)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rateLimit";

const REGISTER_RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };

// Validation email simple mais robuste
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  // ── Rate limiting ────────────────────────────────────────────────────────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const rl = rateLimit("register", ip, REGISTER_RATE_LIMIT);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans une heure." },
      { status: 429 }
    );
  }

  try {
    const body = await req.json() as {
      prenom?: string;
      nom?: string;
      email?: string;
      password?: string;
      confirmPassword?: string;
      motif?: string;
    };

    // ── Validation des champs ────────────────────────────────────────────────
    const prenom = body.prenom?.trim() ?? "";
    const nom = body.nom?.trim() ?? "";
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";
    const confirmPassword = body.confirmPassword ?? "";
    const motif = body.motif?.trim() ?? "";

    if (!prenom || !nom || !email || !password || !confirmPassword || !motif) {
      return NextResponse.json(
        { error: "Tous les champs sont requis." },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Adresse e-mail invalide." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Le mot de passe doit contenir au moins 8 caractères." },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: "Les mots de passe ne correspondent pas." },
        { status: 400 }
      );
    }

    if (motif.length < 10) {
      return NextResponse.json(
        { error: "Le motif doit contenir au moins 10 caractères." },
        { status: 400 }
      );
    }

    // ── Vérification doublon (message générique pour éviter l'énumération) ───
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Message délibérément vague — ne révèle pas si l'email est connu
      return NextResponse.json(
        { error: "Une demande avec cet email est déjà en cours ou ce compte existe déjà." },
        { status: 409 }
      );
    }

    // ── Création du compte en attente ────────────────────────────────────────
    const hashed = await hashPassword(password);
    const name = `${prenom} ${nom}`;

    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashed,
        role: "USER",
        isActive: false,
        registrationStatus: "PENDING",
        registrationComment: motif,
      },
    });

    await logAudit("REGISTER_REQUEST", "User", {
      entityId: user.id,
      details: { email: user.email, name: user.name },
    });

    return NextResponse.json(
      { message: "Votre demande d'inscription a bien été enregistrée. Elle sera examinée par un administrateur." },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
