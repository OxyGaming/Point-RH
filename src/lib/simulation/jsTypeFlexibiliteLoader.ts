/**
 * Charge la map JsType.code → FlexibiliteJs depuis la base de données.
 * Utilisé par le moteur de simulation pour résoudre la flexibilité
 * des JS sources lors du figeage.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import type { FlexibiliteJs } from "@/types/js-simulation";

export async function loadJsTypeFlexibiliteMap(): Promise<Map<string, FlexibiliteJs>> {
  const jsTypes = await prisma.jsType.findMany({
    select: { code: true, flexibilite: true },
    where: { actif: true },
  });
  return new Map(
    jsTypes.map((jt) => [jt.code, jt.flexibilite as FlexibiliteJs])
  );
}
