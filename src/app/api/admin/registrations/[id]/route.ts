/**
 * PATCH /api/admin/registrations/[id]
 *
 * Approuve ou refuse une demande d'inscription (admin uniquement).
 * Corps : { action: "approve" | "reject", role?: "USER" | "ADMIN" }
 *
 * - approve : registrationStatus → APPROVED, isActive → true, role assigné
 * - reject  : registrationStatus → REJECTED, isActive → false
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json() as { action?: string; role?: string };

  if (body.action !== "approve" && body.action !== "reject") {
    return NextResponse.json(
      { error: "L'action doit être \"approve\" ou \"reject\"." },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });
  }

  if (target.registrationStatus === "APPROVED") {
    return NextResponse.json(
      { error: "Ce compte est déjà approuvé." },
      { status: 409 }
    );
  }

  if (body.action === "approve") {
    const role =
      body.role === "ADMIN" ? "ADMIN" : "USER";

    const updated = await prisma.user.update({
      where: { id },
      data: {
        registrationStatus: "APPROVED",
        isActive: true,
        role,
      },
    });

    await logAudit("APPROVE_REGISTRATION", "User", {
      user: auth.user,
      entityId: id,
      details: { email: target.email, role: updated.role },
    });

    return NextResponse.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      registrationStatus: updated.registrationStatus,
      role: updated.role,
      isActive: updated.isActive,
    });
  } else {
    const updated = await prisma.user.update({
      where: { id },
      data: {
        registrationStatus: "REJECTED",
        isActive: false,
      },
    });

    await logAudit("REJECT_REGISTRATION", "User", {
      user: auth.user,
      entityId: id,
      details: { email: target.email },
    });

    return NextResponse.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      registrationStatus: updated.registrationStatus,
      isActive: updated.isActive,
    });
  }
}
