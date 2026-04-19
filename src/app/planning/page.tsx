"use client";

import React, {
  useState, useEffect, useMemo, useCallback, useRef,
} from "react";
import { useRouter } from "next/navigation";
import type { JsTimeline } from "@/types/multi-js-simulation";

// ── Constants ─────────────────────────────────────────────────────────────────

const LEFT_W   = 180;   // px — sticky left column
const DAY_W    = 148;   // px — one day column
const ROW_H    = 44;    // px — agent/poste row
const GRP_H    = 26;    // px — group header
const HDR_H    = 58;    // px — day header
const OVERSCAN = ROW_H * 8; // px to render beyond viewport edges

const DAYS_FR   = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const MONTHS_FR = ["jan.", "fév.", "mar.", "avr.", "mai", "juin", "juil.",
                   "août", "sep.", "oct.", "nov.", "déc."];

const VIS_MIN     = 5;
const VIS_MAX     = 28;
const VIS_DEFAULT = 10;

interface ImportRecord { id: string; filename: string; importedAt: string; nbAgents: number; isActive: boolean }
type GroupBy  = "agent-az" | "agent-za" | "debut" | "libelle";
type ShiftType = "M" | "J" | "S" | "N";

const SHIFT_COLORS: Record<ShiftType, string> = {
  M: "#06b6d4", J: "#3b82f6", S: "#f97316", N: "#7c3aed",
};
const SHIFT_LABELS: Record<ShiftType, string> = {
  M: "Matin", J: "Journée", S: "Soir", N: "Nuit",
};

// ── Virtual row items ─────────────────────────────────────────────────────────

type VItem =
  | { kind: "group";  id: string; h: number; label: string; count: number; color: string }
  | { kind: "prefix"; id: string; h: number; label: string }
  | { kind: "agent";  id: string; h: number; agentKey: string; label: string; sub: string; rowIdx: number };

// ── Helpers ───────────────────────────────────────────────────────────────────

function addDaysStr(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isWknd(date: string): boolean {
  const d = new Date(date + "T00:00:00Z").getUTCDay();
  return d === 0 || d === 6;
}

function fmtDayHeader(date: string) {
  const d = new Date(date + "T00:00:00Z");
  return { n: d.getUTCDate(), wd: DAYS_FR[d.getUTCDay()], mo: MONTHS_FR[d.getUTCMonth()] };
}

function fmtRange(a: string, b: string): string {
  const da = new Date(a + "T00:00:00Z");
  const db = new Date(b + "T00:00:00Z");
  const fmt = (d: Date) => `${d.getUTCDate()} ${MONTHS_FR[d.getUTCMonth()]}`;
  return `${fmt(da)} — ${fmt(db)}`;
}

function toHours(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h + m / 60;
}

function getShiftType(
  heureDebut: string, heureFin: string, isNuit: boolean,
  heureDebutJsType?: string | null, heureFinJsType?: string | null,
  codeJs?: string | null,
): ShiftType {
  // Règle prioritaire : 2 derniers caractères du code JS
  if (codeJs) {
    const last2 = codeJs.slice(-2);
    if (last2.includes("4")) return "M";
    if (last2.includes("5")) return "S";
    if (last2.includes("6")) return "N";
  }
  // Fallback : horaires JsType (sans trajet) puis horaires importés
  if (isNuit) return "N";
  const deb = toHours(heureDebutJsType ?? heureDebut);
  const fin = toHours(heureFinJsType  ?? heureFin);
  if (fin < deb && fin > 0) return "N";
  if (fin < 14)  return "M";
  if (fin < 19)  return "J";
  return "S";
}

function dominantLibelle(
  key: string,
  jsByAgentDate: Map<string, Map<string, JsTimeline[]>>,
  refDate: string,
): string {
  const list = jsByAgentDate.get(key)?.get(refDate) ?? [];
  if (!list.length) return "???";
  const prefix = list[0].codeJs ? list[0].codeJs.trim().slice(0, 3).toUpperCase() : "???";
  return prefix;
}

function dominantShift(key: string, jsByAgent: Map<string, JsTimeline[]>): ShiftType {
  const list  = jsByAgent.get(key) ?? [];
  const counts: Record<ShiftType, number> = { M: 0, J: 0, S: 0, N: 0 };
  for (const js of list) counts[getShiftType(js.heureDebut, js.heureFin, js.isNuit, js.heureDebutJsType, js.heureFinJsType, js.codeJs)]++;
  return (["M", "J", "S", "N"] as ShiftType[]).reduce((a, b) =>
    counts[a] >= counts[b] ? a : b);
}

// First index where item.top + item.h > viewStart
function firstVisibleIdx(tops: number[], heights: number[], viewStart: number): number {
  let lo = 0, hi = tops.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tops[mid] + heights[mid] <= viewStart) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Last index where item.top < viewEnd
function lastVisibleIdx(tops: number[], viewEnd: number): number {
  let lo = 0, hi = tops.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tops[mid] >= viewEnd) hi = mid - 1;
    else lo = mid;
  }
  return lo;
}

// ── Bar component ─────────────────────────────────────────────────────────────

const JsBar = React.memo(function JsBar({
  js, selected, onToggle, overflow,
}: { js: JsTimeline; selected: boolean; onToggle: (id: string) => void; overflow?: boolean }) {
  const type  = getShiftType(js.heureDebut, js.heureFin, js.isNuit, js.heureDebutJsType, js.heureFinJsType, js.codeJs);
  const color = SHIFT_COLORS[type];
  const deb   = toHours(js.heureDebut);
  const finRaw = toHours(js.heureFin);
  const h     = Math.floor(js.amplitudeMin / 60);
  const m     = String(js.amplitudeMin % 60).padStart(2, "0");

  let left: number, width: number, radius: string;
  if (overflow) {
    // Continuation du lendemain : de 0h à heureFin
    left   = 0;
    width  = Math.max((finRaw / 24) * DAY_W, 6);
    radius = "0 4px 4px 0";
  } else {
    const fin = finRaw < deb && finRaw > 0 ? 24 : finRaw; // nuit : cap à minuit
    left   = (deb / 24) * DAY_W;
    width  = Math.max(((fin - deb) / 24) * DAY_W, 6);
    // Si la JS déborde sur le lendemain, coin droit carré
    radius = finRaw < deb && finRaw > 0 ? "4px 0 0 4px" : "4px";
  }

  return (
    <button
      onClick={() => onToggle(js.planningLigneId)}
      title={`${js.agentPrenom} ${js.agentNom} · ${js.codeJs ?? "?"} · ${js.heureDebut}–${js.heureFin} (${h}h${m})`}
      style={{
        position: "absolute", left: `${left}px`, width: `${width}px`,
        top: "7px", bottom: "7px", borderRadius: radius,
        backgroundColor: selected ? "#bfdbfe" : color,
        backgroundImage: js.flexibilite === "DERNIER_RECOURS"
          ? "repeating-linear-gradient(45deg, rgba(255,255,255,0.22) 0px, rgba(255,255,255,0.22) 3px, transparent 3px, transparent 8px)"
          : undefined,
        color:         selected ? "#1d4ed8" : "white",
        outline:       selected ? "2px solid #3b82f6" : "none",
        outlineOffset: "1px",
        fontSize: "9px", fontWeight: "700",
        whiteSpace: "nowrap", overflow: "hidden",
        paddingLeft: "4px", display: "flex", alignItems: "center",
        boxShadow: "0 1px 2px rgba(0,0,0,.18)",
        zIndex: selected ? 3 : 2, cursor: "pointer",
        opacity: overflow ? 0.8 : 1,
      }}
    >
      {width > 28 ? (js.codeJs ?? "JS") : ""}
    </button>
  );
});

// ── Day header cell ───────────────────────────────────────────────────────────

const DayHead = React.memo(function DayHead({ date }: { date: string }) {
  const { n, wd, mo } = fmtDayHeader(date);
  const wknd = isWknd(date);
  return (
    <div
      className="flex flex-col border-r border-b border-[#e2e8f0] shrink-0"
      style={{ width: DAY_W, height: HDR_H, background: wknd ? "#f8f0ff" : "#f8fafc" }}
    >
      <div className="flex items-baseline gap-1 px-2 pt-1.5 pb-0.5">
        <span className="text-[15px] font-[800] leading-none"
          style={{ color: wknd ? "#7c3aed" : "#1a3070" }}>{n}</span>
        <span className="text-[9px] font-[600] uppercase tracking-wider"
          style={{ color: wknd ? "#a78bfa" : "#94a3b8" }}>{wd}</span>
        <span className="text-[9px]" style={{ color: wknd ? "#a78bfa" : "#94a3b8" }}>{mo}</span>
      </div>
      <div className="flex-1 relative border-t border-[#e9eef5]">
        {[0, 6, 12, 18].map((h) => (
          <div key={h} className="absolute bottom-0 top-0 flex items-end pb-px"
            style={{ left: `${(h / 24) * DAY_W}px` }}>
            <div className="h-full border-l"
              style={{ borderColor: h === 0 ? "transparent" : "#e2e8f0" }} />
            <span className="text-[8px] text-[#c0cce0] ml-0.5 leading-none">{h}h</span>
          </div>
        ))}
      </div>
    </div>
  );
});

// ── Day cell (body) ───────────────────────────────────────────────────────────

const DayCell = React.memo(function DayCell({
  jsList, overflowList, date, rowIndex, selectedIds, onToggle,
}: {
  jsList: JsTimeline[]; overflowList: JsTimeline[]; date: string; rowIndex: number;
  selectedIds: Set<string>; onToggle: (id: string) => void;
}) {
  const wknd = isWknd(date);
  const even = rowIndex % 2 === 0;
  return (
    <div
      className="border-r border-b border-[#e2e8f0] relative shrink-0 overflow-hidden"
      style={{
        width: DAY_W, height: ROW_H,
        background: wknd ? (even ? "#fdf8ff" : "#faf5ff")
                         : (even ? "#ffffff"  : "#f8fafc"),
      }}
    >
      {[6, 12, 18].map((h) => (
        <div key={h} className="absolute top-0 bottom-0 border-l border-[#f0f4f8]"
          style={{ left: `${(h / 24) * DAY_W}px` }} />
      ))}
      {overflowList.map((js) => (
        <JsBar key={`ovf-${js.planningLigneId}`} js={js}
          selected={selectedIds.has(js.planningLigneId)} onToggle={onToggle} overflow />
      ))}
      {jsList.map((js) => (
        <JsBar key={js.planningLigneId} js={js}
          selected={selectedIds.has(js.planningLigneId)} onToggle={onToggle} />
      ))}
    </div>
  );
});

// ── Left label cell ───────────────────────────────────────────────────────────

const LeftCell = React.memo(function LeftCell({
  label, sub, rowIndex,
}: { label: string; sub: string; rowIndex: number }) {
  const even = rowIndex % 2 === 0;
  return (
    <div
      className="sticky left-0 z-10 border-r border-b border-[#e2e8f0] flex flex-col justify-center px-3 shrink-0"
      style={{ width: LEFT_W, height: ROW_H, background: even ? "#ffffff" : "#f8fafc" }}
    >
      <span className="text-[11px] font-[600] text-[#1e293b] truncate leading-tight">{label}</span>
      <span className="text-[9px] text-[#94a3b8] font-mono">{sub}</span>
    </div>
  );
});

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PlanningPage() {
  const router = useRouter();

  const [imports,   setImports]   = useState<ImportRecord[]>([]);
  const [importId,  setImportId]  = useState("");
  const [jsData,    setJsData]    = useState<JsTimeline[]>([]);
  const [loading,   setLoading]   = useState(false);

  const [groupBy,   setGroupBy]   = useState<GroupBy>("agent-az");
  const [filter,    setFilter]    = useState("");
  const [hideUnknown, setHideUnknown] = useState(false);
  const [selected,  setSelected]  = useState<Set<string>>(new Set());
  const [slider,    setSlider]    = useState(0);
  const [visDays,   setVisDays]   = useState(VIS_DEFAULT);

  const [userFilterIds,    setUserFilterIds]    = useState<Set<string>>(new Set());
  const [userFilterActive, setUserFilterActive] = useState(false);

  // Scroll virtualization
  const gridRef  = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH,     setViewH]     = useState(600);

  // ── Load imports ─────────────────────────────────────────────────────────

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/import", { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data: ImportRecord[]) => {
        if (!Array.isArray(data)) return;
        setImports(data);
        const active = data.find((d) => d.isActive) ?? data[0];
        if (active) setImportId(active.id);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  // ── Load JS data ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!importId) return;
    const ctrl = new AbortController();
    setLoading(true);
    setSelected(new Set());
    setJsData([]);
    setSlider(0);
    fetch(`/api/multi-js-simulation/js-list?importId=${importId}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data: JsTimeline[]) => {
        if (Array.isArray(data)) setJsData(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [importId]);

  // ── Load user agent filter ───────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/user-filter")
      .then((r) => r.json())
      .then((data: { selectedIds: string[]; isActive: boolean }) => {
        if (Array.isArray(data.selectedIds)) setUserFilterIds(new Set(data.selectedIds));
        setUserFilterActive(data.isActive === true);
      })
      .catch(() => {});
  }, []);

  // ── Track container height ───────────────────────────────────────────────

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    setViewH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // ── All dates in dataset ─────────────────────────────────────────────────

  const allDates = useMemo((): string[] => {
    if (jsData.length === 0) return [];
    const min = jsData.reduce((m, js) => (js.date < m ? js.date : m), jsData[0].date);
    const max = jsData.reduce((m, js) => (js.date > m ? js.date : m), jsData[0].date);
    const dates: string[] = [];
    let cur = min;
    while (cur <= max) { dates.push(cur); cur = addDaysStr(cur, 1); }
    return dates;
  }, [jsData]);

  const totalDays  = allDates.length;
  const sliderMax  = Math.max(0, totalDays - visDays);
  const safeSlider = Math.min(slider, sliderMax);

  const visibleDates = useMemo(
    () => allDates.slice(safeSlider, safeSlider + visDays),
    [allDates, safeSlider, visDays],
  );

  // ── JS indices ───────────────────────────────────────────────────────────

  const jsByAgent = useMemo(() => {
    const map = new Map<string, JsTimeline[]>();
    for (const js of jsData) {
      const key = js.agentId ?? js.agentMatricule;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(js);
    }
    return map;
  }, [jsData]);

  const jsByAgentDate = useMemo(() => {
    const outer = new Map<string, Map<string, JsTimeline[]>>();
    for (const js of jsData) {
      const agKey = js.agentId ?? js.agentMatricule;
      if (!outer.has(agKey)) outer.set(agKey, new Map());
      const inner = outer.get(agKey)!;
      if (!inner.has(js.date)) inner.set(js.date, []);
      inner.get(js.date)!.push(js);
    }
    return outer;
  }, [jsData]);


  const agents = useMemo(() => {
    const seen = new Map<string, { nom: string; prenom: string; matricule: string }>();
    for (const js of jsData) {
      const key = js.agentId ?? js.agentMatricule;
      if (!seen.has(key))
        seen.set(key, { nom: js.agentNom, prenom: js.agentPrenom, matricule: js.agentMatricule });
    }
    return seen;
  }, [jsData]);

  const visibleDateSet = useMemo(() => new Set(visibleDates), [visibleDates]);

  // ── Agent row list ───────────────────────────────────────────────────────

  type AgentRow = { key: string; label: string; sub: string; shift: ShiftType };

  const agentRows = useMemo((): AgentRow[] => {

    let list = Array.from(agents.entries()).map(([key, a]) => ({
      key,
      label: `${a.prenom} ${a.nom}`,
      sub:   a.matricule,
      shift: dominantShift(key, jsByAgent),
    }));

    if (userFilterActive && userFilterIds.size > 0) {
      list = list.filter((r) => userFilterIds.has(r.key));
    }

    if (filter) {
      const q = filter.toLowerCase();
      list = list.filter((r) => {
        if (r.label.toLowerCase().includes(q) || r.sub.toLowerCase().includes(q)) return true;
        const byDate = jsByAgentDate.get(r.key);
        if (!byDate) return false;
        for (const day of visibleDates)
          if ((byDate.get(day) ?? []).some((js) => js.codeJs?.toLowerCase().includes(q)))
            return true;
        return false;
      });
    }


    if (groupBy === "agent-az" || groupBy === "libelle")
      list.sort((a, b) => a.label.localeCompare(b.label));
    else if (groupBy === "agent-za")
      list.sort((a, b) => b.label.localeCompare(a.label));
    else if (groupBy === "debut") {
      const SHIFT_ORDER: Record<ShiftType, number> = { J: 0, M: 1, S: 2, N: 3 };
      const refDate = visibleDates[0]; // jour ciblé par le slider
      const shiftOnDay = (key: string): ShiftType => {
        const dayJs = jsByAgentDate.get(key)?.get(refDate) ?? [];
        if (!dayJs.length) return "N"; // pas de JS ce jour → fin de liste
        const js = dayJs[0];
        return getShiftType(js.heureDebut, js.heureFin, js.isNuit, js.heureDebutJsType, js.heureFinJsType, js.codeJs);
      };
      const startOnDay = (key: string): number => {
        const dayJs = jsByAgentDate.get(key)?.get(refDate) ?? [];
        return dayJs.length ? toHours(dayJs[0].heureDebut) : 99;
      };
      list.sort((a, b) => {
        const diff = SHIFT_ORDER[shiftOnDay(a.key)] - SHIFT_ORDER[shiftOnDay(b.key)];
        return diff !== 0 ? diff : startOnDay(a.key) - startOnDay(b.key);
      });
    }
    return list;
  }, [groupBy, agents, filter, visibleDates, jsByAgent, jsByAgentDate, userFilterActive, userFilterIds]);


  // ── Virtual flat item list ───────────────────────────────────────────────

  const allItems = useMemo((): VItem[] => {
    const items: VItem[] = [];

    if (groupBy === "libelle") {
      const buckets = new Map<string, AgentRow[]>();
      for (const row of agentRows) {
        const lib = dominantLibelle(row.key, jsByAgentDate, visibleDates[0] ?? "");
        if (!buckets.has(lib)) buckets.set(lib, []);
        buckets.get(lib)!.push(row);
      }
      const sorted = Array.from(buckets.entries())
        .filter(([lib]) => !(hideUnknown && lib === "???"))
        .sort(([a], [b]) => {
          if (a === "???") return 1;
          if (b === "???") return -1;
          return a.localeCompare(b);
        });
      let ri = 0;
      for (const [lib, rows] of sorted) {
        items.push({ kind: "group", id: `grp-lib-${lib}`, h: GRP_H, label: lib, count: rows.length, color: "#475569" });
        for (const row of rows)
          items.push({ kind: "agent", id: row.key, h: ROW_H, agentKey: row.key, label: row.label, sub: row.sub, rowIdx: ri++ });
      }
    } else {
      agentRows.forEach((row, idx) =>
        items.push({ kind: "agent", id: row.key, h: ROW_H, agentKey: row.key, label: row.label, sub: row.sub, rowIdx: idx }));
    }

    return items;
  }, [groupBy, agentRows, jsByAgentDate, visibleDates, hideUnknown]);

  // Cumulative top positions for each item
  const itemTops = useMemo(() => {
    let y = 0;
    return allItems.map((item) => { const top = y; y += item.h; return top; });
  }, [allItems]);

  const totalRowsH = useMemo(
    () => allItems.reduce((s, it) => s + it.h, 0),
    [allItems],
  );

  // ── Stats ────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const windowJs = jsData.filter((js) => visibleDateSet.has(js.date));
    return { rows: agentRows.length, total: windowJs.length, nuits: windowJs.filter((js) => js.isNuit).length };
  }, [jsData, visibleDateSet, agentRows.length]);

  // ── Scroll virtualization ────────────────────────────────────────────────

  const { firstIdx, lastIdx } = useMemo(() => {
    if (allItems.length === 0) return { firstIdx: 0, lastIdx: -1 };
    const heights  = allItems.map((it) => it.h);
    const viewStart = Math.max(0, scrollTop - OVERSCAN);
    const viewEnd   = scrollTop + viewH + OVERSCAN;
    const fi = firstVisibleIdx(itemTops, heights, viewStart);
    const li = lastVisibleIdx(itemTops, viewEnd);
    return { firstIdx: fi, lastIdx: Math.min(li, allItems.length - 1) };
  }, [allItems, itemTops, scrollTop, viewH]);

  const topSpacer    = itemTops[firstIdx] ?? 0;
  const lastItemBot  = lastIdx >= 0 ? (itemTops[lastIdx] ?? 0) + (allItems[lastIdx]?.h ?? 0) : 0;
  const bottomSpacer = Math.max(0, totalRowsH - lastItemBot);

  // ── Interaction ──────────────────────────────────────────────────────────

  const onGridScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleSimulate = useCallback(() => {
    const sel = jsData.filter((js) => selected.has(js.planningLigneId));
    const jsCibles = sel.map((js) => ({
      planningLigneId:  js.planningLigneId,
      agentId:          js.agentId ?? "",
      agentNom:         js.agentNom,
      agentPrenom:      js.agentPrenom,
      agentMatricule:   js.agentMatricule,
      date:             js.date,
      heureDebut:       js.heureDebut,
      heureFin:         js.heureFin,
      heureDebutJsType: js.heureDebutJsType,
      heureFinJsType:   js.heureFinJsType,
      amplitudeMin:     js.amplitudeMin,
      codeJs:           js.codeJs,
      typeJs:           js.typeJs,
      isNuit:           js.isNuit,
      importId:         js.importId,
      flexibilite:      js.flexibilite ?? "OBLIGATOIRE",
    }));
    try { sessionStorage.setItem("pointrh_multiJs_preselect", JSON.stringify(jsCibles)); } catch {}
    router.push("/simulations/multi-js");
  }, [jsData, selected, router]);

  const zoomIn  = useCallback(() => setVisDays((v) => Math.max(VIS_MIN, v - 2)), []);
  const zoomOut = useCallback(() => setVisDays((v) => Math.min(VIS_MAX, v + 2)), []);
  const onSlide = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setSlider(Number(e.target.value)), []);

  const nbSelected = selected.size;
  const rowW = LEFT_W + visibleDates.length * DAY_W;

  // ── Row renderer ─────────────────────────────────────────────────────────

  function renderItem(item: VItem) {
    if (item.kind === "agent") {
      const byDate = jsByAgentDate.get(item.agentKey);
      return (
        <div key={item.id} className="flex">
          <LeftCell label={item.label} sub={item.sub} rowIndex={item.rowIdx} />
          {visibleDates.map((day) => {
            const prevDay = addDaysStr(day, -1);
            const overflowList = (byDate?.get(prevDay) ?? []).filter((js) => {
              const fin = toHours(js.heureFin);
              return fin < toHours(js.heureDebut) && fin > 0;
            });
            return (
              <DayCell key={day} jsList={byDate?.get(day) ?? []} overflowList={overflowList}
                date={day} rowIndex={item.rowIdx} selectedIds={selected} onToggle={toggleSelect} />
            );
          })}
        </div>
      );
    }
    if (item.kind === "group") {
      return (
        <div key={item.id} className="flex">
          <div
            className="sticky left-0 z-10 border-r border-b border-[#e2e8f0] flex items-center gap-2 px-3 shrink-0"
            style={{ width: LEFT_W, height: GRP_H, background: `${item.color}18`, borderLeft: `3px solid ${item.color}`, color: item.color }}
          >
            <span className="text-[10px] font-[800] uppercase tracking-wider">{item.label}</span>
            <span className="text-[9px] font-[500] opacity-70">{item.count} agent{item.count > 1 ? "s" : ""}</span>
          </div>
          {visibleDates.map((day) => (
            <div key={day} className="border-r border-b border-[#e2e8f0] shrink-0"
              style={{ width: DAY_W, height: GRP_H, background: `${item.color}08` }} />
          ))}
        </div>
      );
    }
    if (item.kind === "prefix") {
      return (
        <div key={item.id} className="flex">
          <div
            className="sticky left-0 z-10 border-r border-b border-[#e2e8f0] flex items-center px-3 gap-2 shrink-0"
            style={{ width: LEFT_W, height: GRP_H, background: "#1a3070", color: "white" }}
          >
            <span className="text-[10px] font-[800] tracking-widest uppercase">{item.label}</span>
          </div>
          {visibleDates.map((day) => (
            <div key={day} className="border-r border-b border-[#e2e8f0] shrink-0"
              style={{ width: DAY_W, height: GRP_H, background: "rgba(26,48,112,0.06)" }} />
          ))}
        </div>
      );
    }
    return null;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col overflow-hidden h-[calc(100vh-3.5rem)] lg:h-screen">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-3 px-4 h-12"
        style={{ background: "#1a3070", color: "white" }}>
        <span className="text-[12px] font-[700] whitespace-nowrap shrink-0">
          Point <span style={{ opacity: 0.45 }}>RH</span>
        </span>
        <span style={{ opacity: 0.2, fontSize: 16 }}>|</span>
        <span className="text-[11px] font-[600] text-white/70 whitespace-nowrap shrink-0">
          Timeline planning
        </span>

        {/* Slider */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[10px] text-white/55 whitespace-nowrap shrink-0">Période</span>
          <input
            type="range" min={0} max={sliderMax} value={safeSlider} onChange={onSlide}
            disabled={totalDays === 0}
            className="flex-1 h-[3px] rounded-full outline-none cursor-pointer disabled:opacity-40"
            style={{ accentColor: "white" }}
          />
          <span className="text-[11px] font-[600] text-white whitespace-nowrap shrink-0 min-w-[140px] text-right">
            {visibleDates.length >= 2
              ? fmtRange(visibleDates[0], visibleDates[visibleDates.length - 1])
              : "—"}
          </span>
        </div>

        {/* Zoom */}
        <div className="flex gap-1 shrink-0">
          <button onClick={zoomOut} disabled={visDays >= VIS_MAX}
            className="w-7 h-7 flex items-center justify-center rounded-md text-[15px] font-[500] disabled:opacity-40 hover:bg-white/20 transition-colors">−</button>
          <button onClick={zoomIn} disabled={visDays <= VIS_MIN}
            className="w-7 h-7 flex items-center justify-center rounded-md text-[15px] font-[500] disabled:opacity-40 hover:bg-white/20 transition-colors">+</button>
        </div>

        {/* Import actif — date de mise à jour */}
        {importId && (() => {
          const imp = imports.find((i) => i.id === importId);
          if (!imp) return null;
          const d = new Date(imp.importedAt);
          const label = `Mise à jour du ${d.getUTCDate()} ${MONTHS_FR[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
          return (
            <>
              <span style={{ opacity: 0.2, fontSize: 16 }}>|</span>
              <span className="text-[11px] text-white/70 whitespace-nowrap shrink-0">{label}</span>
            </>
          );
        })()}
      </div>

      {/* ── Controls bar ────────────────────────────────────────────────── */}
      <div
        className="shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-[#e2e8f0] flex-wrap"
        style={{ paddingLeft: LEFT_W + 16, background: "white" }}
      >
        <span className="text-[11px] font-[600] text-[#64748b]">Suffixe JS</span>
        <input
          type="text" placeholder="ex : M, N, PEY…" value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-7 px-2 text-[12px] border border-[#e2e8f0] rounded-md outline-none focus:border-[#6366f1] w-36"
        />
        <div className="w-px h-5 bg-[#e2e8f0]" />
        <span className="text-[11px] font-[600] text-[#64748b]">Regrouper par</span>
        <select
          value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}
          className="h-7 px-2 text-[12px] border border-[#e2e8f0] rounded-md outline-none bg-white"
        >
          <option value="agent-az">Agent A → Z</option>
          <option value="agent-za">Agent Z → A</option>
          <option value="debut">Heure de début</option>
          <option value="libelle">Libellé JS</option>
        </select>
        {groupBy === "libelle" && (
          <>
            <div className="w-px h-5 bg-[#e2e8f0]" />
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox" checked={hideUnknown}
                onChange={(e) => setHideUnknown(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300 accent-[#1e293b]"
              />
              <span className="text-[11px] font-[600] text-[#64748b]">Masquer les ???</span>
            </label>
          </>
        )}

        {userFilterActive && userFilterIds.size > 0 && (
          <>
            <div className="w-px h-5 bg-[#e2e8f0]" />
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#eff6ff] border border-[#bfdbfe] rounded-md">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-[#2563eb]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              <span className="text-[11px] font-[600] text-[#1e40af]">
                Affichage personnalisé actif — {userFilterIds.size} agent{userFilterIds.size > 1 ? "s" : ""}
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── Legend bar ──────────────────────────────────────────────────── */}
      <div
        className="shrink-0 flex items-center gap-3 px-4 py-1.5 border-b-2 border-[#e2e8f0] flex-wrap"
        style={{ paddingLeft: LEFT_W + 16, background: "white" }}
      >
        <span className="text-[10px] font-[700] text-[#94a3b8] mr-1">Types :</span>
        {(["M", "J", "S", "N"] as ShiftType[]).map((sh) => (
          <div key={sh} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: SHIFT_COLORS[sh] }} />
            <span className="text-[10px] text-[#475569] font-[500]">{SHIFT_LABELS[sh]}</span>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-sm bg-[#64748b]" />
          <span className="text-[10px] text-[#475569] font-[500]">Autre</span>
        </div>
      </div>

      {/* ── Grid ────────────────────────────────────────────────────────── */}
      <div
        ref={gridRef}
        className="flex-1 min-h-0 overflow-auto"
        onScroll={onGridScroll}
      >
        {loading ? (
          <div className="flex items-center justify-center h-32 gap-3 text-[13px] text-[#94a3b8]">
            <div className="w-4 h-4 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
            Chargement…
          </div>
        ) : jsData.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-[13px] text-[#94a3b8]">
            {importId ? "Aucune JS dans cet import" : "Sélectionnez un import"}
          </div>
        ) : (
          <div style={{ minWidth: `${rowW}px` }}>

            {/* Sticky header row */}
            <div className="sticky top-0 z-20 flex border-b-2 border-[#e2e8f0]"
              style={{ minWidth: `${rowW}px` }}>
              <div
                className="sticky left-0 z-30 border-r border-[#e2e8f0] flex items-end px-3 pb-1 shrink-0"
                style={{ background: "#f8fafc", width: LEFT_W, height: HDR_H }}
              >
                <span className="text-[9px] font-[700] uppercase tracking-widest text-[#94a3b8]">
                  Agent
                </span>
              </div>
              {visibleDates.map((day) => <DayHead key={day} date={day} />)}
            </div>

            {/* Top spacer */}
            {topSpacer > 0 && <div style={{ height: topSpacer }} aria-hidden />}

            {/* Visible rows only */}
            {allItems.slice(firstIdx, lastIdx + 1).map(renderItem)}

            {/* Bottom spacer */}
            {bottomSpacer > 0 && <div style={{ height: bottomSpacer }} aria-hidden />}

          </div>
        )}
      </div>

      {/* ── Stats bar ───────────────────────────────────────────────────── */}
      <div
        className="shrink-0 flex items-center gap-4 px-4 py-1.5 border-t border-[#e2e8f0] text-[11px] text-[#64748b]"
        style={{ paddingLeft: LEFT_W + 16, background: "white" }}
      >
        <span>Lignes : <strong className="text-[13px] text-[#1e293b] font-[700]">{stats.rows}</strong></span>
        <div className="w-px h-3.5 bg-[#e2e8f0]" />
        <span>JS travaillées : <strong className="text-[13px] text-[#1e293b] font-[700]">{stats.total}</strong></span>
        <div className="w-px h-3.5 bg-[#e2e8f0]" />
        <span>Nuits : <strong className="text-[13px] text-[#1e293b] font-[700]">{stats.nuits}</strong></span>
        {nbSelected > 0 && (
          <>
            <div className="w-px h-3.5 bg-[#e2e8f0]" />
            <span className="text-[#2563eb] font-[600]">
              {nbSelected} JS sélectionnée{nbSelected > 1 ? "s" : ""}
            </span>
          </>
        )}
      </div>

      {/* ── Floating simulation bar ──────────────────────────────────────── */}
      {nbSelected > 0 && (
        <div
          className="fixed bottom-8 left-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border border-white/10"
          style={{ transform: "translateX(-50%)", background: "#0f1b4c", color: "white" }}
        >
          <span className="text-[13px] font-[600] whitespace-nowrap">
            {nbSelected} JS sélectionnée{nbSelected > 1 ? "s" : ""}
          </span>
          <button onClick={() => setSelected(new Set())}
            className="text-white/50 hover:text-white text-[12px] transition-colors">
            Effacer
          </button>
          <div className="w-px h-4 bg-white/20" />
          <button
            onClick={handleSimulate}
            className="flex items-center gap-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-[12px] font-[700] px-4 py-1.5 rounded-xl transition-colors whitespace-nowrap"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Simuler {nbSelected > 1 ? `${nbSelected} JS` : "cette JS"}
          </button>
        </div>
      )}
    </div>
  );
}
