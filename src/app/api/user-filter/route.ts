import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAuth } from "@/lib/session";

const NB_SLOTS = 4;
const DEFAULT_NAME = (slot: number) => `Filtre ${slot + 1}`;

function normalizeName(raw: unknown, slotIndex: number): string {
  if (typeof raw !== "string") return DEFAULT_NAME(slotIndex);
  const trimmed = raw.trim().slice(0, 40);
  return trimmed.length > 0 ? trimmed : DEFAULT_NAME(slotIndex);
}

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  const rows = await prisma.userAgentFilter.findMany({
    where: { userId: auth.user.id },
    include: { items: { select: { agentId: true } } },
    orderBy: { slotIndex: "asc" },
  });

  // Hydrate les 4 slots (0..3) — les slots absents sont matérialisés vides
  const slots = Array.from({ length: NB_SLOTS }, (_, i) => {
    const row = rows.find((r) => r.slotIndex === i);
    return {
      slotIndex: i,
      name: row?.name ?? DEFAULT_NAME(i),
      selectedIds: row ? row.items.map((it) => it.agentId) : [],
      isActive: row?.isActive ?? false,
    };
  });

  const active = slots.find((s) => s.isActive) ?? null;

  // Rétrocompatibilité : planning/multi-js lisent selectedIds/isActive au top niveau
  return NextResponse.json({
    slots,
    activeSlotIndex: active?.slotIndex ?? null,
    selectedIds: active?.selectedIds ?? [],
    isActive: active !== null,
  });
}

export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as {
    slotIndex?: number;
    name?: string;
    selectedIds?: string[];
    isActive?: boolean;
  };

  const slotIndex = Number.isInteger(body.slotIndex) ? (body.slotIndex as number) : -1;
  if (slotIndex < 0 || slotIndex >= NB_SLOTS) {
    return NextResponse.json({ error: "slotIndex invalide (0..3)" }, { status: 400 });
  }

  const name = normalizeName(body.name, slotIndex);
  const isActive = typeof body.isActive === "boolean" ? body.isActive : false;

  const rawIds = Array.isArray(body.selectedIds) ? body.selectedIds : [];
  const uniqueIds = [
    ...new Set(rawIds.filter((id) => typeof id === "string" && id.length > 0)),
  ];

  const validAgents = uniqueIds.length
    ? await prisma.agent.findMany({
        where: { id: { in: uniqueIds }, deletedAt: null },
        select: { id: true },
      })
    : [];
  const validIds = validAgents.map((a) => a.id);

  await prisma.$transaction(async (tx) => {
    // Contrainte métier : au plus 1 slot actif par utilisateur
    if (isActive) {
      await tx.userAgentFilter.updateMany({
        where: { userId: auth.user.id, slotIndex: { not: slotIndex } },
        data: { isActive: false },
      });
    }

    const filter = await tx.userAgentFilter.upsert({
      where: { userId_slotIndex: { userId: auth.user.id, slotIndex } },
      update: { isActive, name },
      create: { userId: auth.user.id, slotIndex, isActive, name },
      select: { id: true },
    });

    await tx.userAgentFilterItem.deleteMany({ where: { filterId: filter.id } });
    if (validIds.length) {
      await tx.userAgentFilterItem.createMany({
        data: validIds.map((agentId) => ({ filterId: filter.id, agentId })),
      });
    }
  });

  return NextResponse.json({
    ok: true,
    slotIndex,
    accepted: validIds.length,
    rejected: uniqueIds.length - validIds.length,
  });
}
