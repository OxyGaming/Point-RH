import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const simulation = await prisma.simulation.findUnique({
    where: { id },
    include: {
      resultats: {
        include: { agent: true },
        orderBy: { scorePertinence: "desc" },
      },
    },
  });

  if (!simulation) return NextResponse.json({ error: "Simulation introuvable" }, { status: 404 });

  // Parse JSON detail for each result
  const resultats = simulation.resultats.map((r) => ({
    ...r,
    detail: JSON.parse(r.detail),
    agent: {
      ...r.agent,
      habilitations: JSON.parse(r.agent.habilitations) as string[],
    },
  }));

  return NextResponse.json({ ...simulation, resultats });
}
