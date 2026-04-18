import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAuth } from "@/lib/session";

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  const filter = await prisma.userAgentFilter.findUnique({
    where: { userId: auth.user.id },
  });

  if (!filter) {
    return NextResponse.json({ selectedIds: [], isActive: false });
  }

  return NextResponse.json({
    selectedIds: JSON.parse(filter.selectedIds) as string[],
    isActive: filter.isActive,
  });
}

export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  const body = await req.json() as { selectedIds?: string[]; isActive?: boolean };
  const selectedIds = Array.isArray(body.selectedIds) ? body.selectedIds : [];
  const isActive = typeof body.isActive === "boolean" ? body.isActive : false;

  await prisma.userAgentFilter.upsert({
    where: { userId: auth.user.id },
    update: { selectedIds: JSON.stringify(selectedIds), isActive },
    create: { userId: auth.user.id, selectedIds: JSON.stringify(selectedIds), isActive },
  });

  return NextResponse.json({ ok: true });
}
