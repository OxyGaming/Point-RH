/**
 * GET /api/admin/registrations
 *
 * Liste les demandes d'inscription (admin uniquement).
 * Paramètre optionnel : ?status=PENDING|APPROVED|REJECTED|all (défaut: all)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdmin } from "@/lib/session";

export async function GET(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  const { searchParams } = req.nextUrl;
  const statusFilter = searchParams.get("status");

  const where =
    statusFilter && statusFilter !== "all"
      ? { registrationStatus: statusFilter }
      : {};

  try {
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        registrationStatus: true,
        registrationComment: true,
        createdAt: true,
      },
      orderBy: [
        // Pending en premier, puis par date décroissante
        { registrationStatus: "asc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json(users);
  } catch (err) {
    console.error("[registrations GET]", err);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
