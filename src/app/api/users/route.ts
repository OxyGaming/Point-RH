/**
 * GET  /api/users — Liste des utilisateurs (admin)
 * POST /api/users — Création d'un utilisateur (admin)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { checkAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json() as {
      email?: string;
      name?: string;
      password?: string;
      role?: string;
    };

    if (!body.email || !body.name || !body.password) {
      return NextResponse.json(
        { error: "email, name et password sont requis." },
        { status: 400 }
      );
    }

    const role = body.role === "ADMIN" ? "ADMIN" : "USER";
    const email = body.email.trim().toLowerCase();

    // Vérifier unicité
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Un utilisateur avec cet email existe déjà." },
        { status: 409 }
      );
    }

    if (body.password.length < 8) {
      return NextResponse.json(
        { error: "Le mot de passe doit contenir au moins 8 caractères." },
        { status: 400 }
      );
    }

    const hashed = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: { email, name: body.name.trim(), password: hashed, role },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    });

    await logAudit("CREATE_USER", "User", {
      user: auth.user,
      entityId: user.id,
      details: { email: user.email, role: user.role },
    });

    return NextResponse.json(user, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
