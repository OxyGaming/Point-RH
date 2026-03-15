/**
 * PATCH  /api/users/[id] — Modifier un utilisateur (admin)
 * DELETE /api/users/[id] — Désactiver / supprimer un utilisateur (admin)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { checkAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  try {
    const body = await req.json() as {
      name?: string;
      role?: string;
      isActive?: boolean;
      password?: string;
    };

    const data: Record<string, unknown> = {};
    if (body.name) data.name = body.name.trim();
    if (body.role === "ADMIN" || body.role === "USER") data.role = body.role;
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    if (body.password) {
      if (body.password.length < 8) {
        return NextResponse.json(
          { error: "Le mot de passe doit contenir au moins 8 caractères." },
          { status: 400 }
        );
      }
      data.password = await hashPassword(body.password);
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    });

    await logAudit("UPDATE_USER", "User", {
      user: auth.user,
      entityId: id,
      details: { fields: Object.keys(data) },
    });

    return NextResponse.json(user);
  } catch {
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  // Empêcher l'admin de se supprimer lui-même
  if (id === auth.user.id) {
    return NextResponse.json(
      { error: "Vous ne pouvez pas supprimer votre propre compte." },
      { status: 400 }
    );
  }

  try {
    await logAudit("DELETE_USER", "User", {
      user: auth.user,
      entityId: id,
    });
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
