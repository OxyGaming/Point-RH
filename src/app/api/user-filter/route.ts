import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAuth } from "@/lib/session";

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  const filter = await prisma.userAgentFilter.findUnique({
    where: { userId: auth.user.id },
    include: { items: { select: { agentId: true } } },
  });

  if (!filter) {
    return NextResponse.json({ selectedIds: [], isActive: false });
  }

  return NextResponse.json({
    selectedIds: filter.items.map((i) => i.agentId),
    isActive: filter.isActive,
  });
}

export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as { selectedIds?: string[]; isActive?: boolean };
  const rawIds = Array.isArray(body.selectedIds) ? body.selectedIds : [];
  const isActive = typeof body.isActive === "boolean" ? body.isActive : false;

  const uniqueIds = [...new Set(rawIds.filter((id) => typeof id === "string" && id.length > 0))];

  const validAgents = uniqueIds.length
    ? await prisma.agent.findMany({
        where: { id: { in: uniqueIds }, deletedAt: null },
        select: { id: true },
      })
    : [];
  const validIds = validAgents.map((a) => a.id);

  await prisma.$transaction(async (tx) => {
    const filter = await tx.userAgentFilter.upsert({
      where: { userId: auth.user.id },
      update: { isActive },
      create: { userId: auth.user.id, isActive },
      select: { id: true },
    });
    await tx.userAgentFilterItem.deleteMany({ where: { filterId: filter.id } });
    if (validIds.length) {
      await tx.userAgentFilterItem.createMany({
        data: validIds.map((agentId) => ({ filterId: filter.id, agentId })),
      });
    }
  });

  return NextResponse.json({ ok: true, accepted: validIds.length, rejected: uniqueIds.length - validIds.length });
}
