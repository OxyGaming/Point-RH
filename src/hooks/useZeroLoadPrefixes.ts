"use client";

/**
 * Hook : récupère la liste des préfixes additionnels assimilés JS Z
 * (table ZeroLoadPrefix). Cache en mémoire le temps de la session client.
 *
 * En cas d'erreur réseau / 401, retourne []. La logique de fallback dans
 * isZeroLoadJs garantit que les règles built-in (suffixe " Z", préfixe "FO",
 * typeJs "DIS") restent appliquées sans préfixes additionnels.
 */
import { useEffect, useState } from "react";

let _cache: string[] | null = null;
let _inflight: Promise<string[]> | null = null;

async function fetchPrefixes(): Promise<string[]> {
  if (_cache !== null) return _cache;
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      const res = await fetch("/api/zero-load-prefixes");
      if (!res.ok) return [];
      const data: unknown = await res.json();
      if (!Array.isArray(data)) return [];
      const prefixes = data.filter((x): x is string => typeof x === "string");
      _cache = prefixes;
      return prefixes;
    } catch {
      return [];
    } finally {
      _inflight = null;
    }
  })();
  return _inflight;
}

export function useZeroLoadPrefixes(): string[] {
  const [prefixes, setPrefixes] = useState<string[]>(_cache ?? []);

  useEffect(() => {
    let cancelled = false;
    fetchPrefixes().then((p) => {
      if (!cancelled) setPrefixes(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return prefixes;
}
