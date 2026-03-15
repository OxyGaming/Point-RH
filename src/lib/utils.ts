/**
 * Convertit une heure Excel (datetime.time) en "HH:MM"
 * L'heure peut arriver comme Date (openpyxl/xlsx renvoie parfois un Date avec heure seule)
 * ou comme string "HH:MM:SS"
 */
export function formatTime(val: unknown): string {
  if (!val) return "00:00";
  if (val instanceof Date) {
    const h = val.getUTCHours().toString().padStart(2, "0");
    const m = val.getUTCMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
  }
  if (typeof val === "string") {
    return val.slice(0, 5);
  }
  if (typeof val === "number") {
    // fraction of day
    const totalMin = Math.round(val * 24 * 60);
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  }
  return "00:00";
}

/**
 * Convertit "HH:MM" en minutes
 */
export function timeToMinutes(hhmm: string): number {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Convertit des minutes en "HH:MM"
 */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  const sign = minutes < 0 ? "-" : "";
  return `${sign}${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/**
 * Combine une date (YYYY-MM-DD ou Date) et une heure "HH:MM" en Date UTC
 */
export function combineDateTime(date: Date | string, hhmm: string): Date {
  const d = typeof date === "string" ? new Date(date) : date;
  const [h, m] = hhmm.split(":").map(Number);
  const result = new Date(d);
  result.setUTCHours(h || 0, m || 0, 0, 0);
  return result;
}

/**
 * Différence en minutes entre deux Date
 */
export function diffMinutes(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 60000;
}

/**
 * Formate une durée en minutes en "Xh YYmin"
 */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m.toString().padStart(2, "0")}min`;
}

/**
 * Centesimal (900 = 9h00) → minutes
 */
export function centesimalToMinutes(cent: number): number {
  const h = Math.floor(cent / 100);
  const dec = cent % 100; // centesimals
  return h * 60 + Math.round(dec * 0.6);
}

/**
 * Calcule la durée de chevauchement (en minutes) d'une JS avec la période nocturne [21h30, 06h30].
 * Gère le passage minuit.
 */
export function minutesNocturnes(heureDebut: string, heureFin: string): number {
  const debut = timeToMinutes(heureDebut);
  let fin = timeToMinutes(heureFin);
  if (fin <= debut) fin += 24 * 60; // passage minuit

  const NUIT_MATIN_FIN = 6 * 60 + 30;   // 390 min : 06h30
  const NUIT_SOIR_DEB  = 21 * 60 + 30;  // 1290 min : 21h30

  let overlap = 0;
  // Segment avant minuit : [1290, 1440]
  overlap += Math.max(0, Math.min(fin, 1440) - Math.max(debut, NUIT_SOIR_DEB));
  if (fin > 1440) {
    // Passage minuit : segment [1440, 1830]
    overlap += Math.max(0, Math.min(fin, 1440 + NUIT_MATIN_FIN) - Math.max(debut, 1440));
  } else {
    // JS sans passage minuit qui commence tôt le matin
    overlap += Math.max(0, Math.min(fin, NUIT_MATIN_FIN) - Math.max(debut, 0));
  }
  return Math.max(0, overlap);
}

/**
 * Une JS est de nuit si elle comprend plus de 2h30 dans la période nocturne (21h30-06h30).
 */
export function isJsDeNuit(heureDebut: string, heureFin: string): boolean {
  return minutesNocturnes(heureDebut, heureFin) > 150; // 2h30 = 150 min
}

/**
 * Une JS "comporte la période 0h-4h" si elle chevauche la fenêtre [00h00, 04h00].
 * Utilisé pour déterminer si une GPT est de nuit.
 */
export function jsComportePeriode0h4h(heureDebut: string, heureFin: string): boolean {
  const debut = timeToMinutes(heureDebut);
  let fin = timeToMinutes(heureFin);
  if (fin <= debut) fin += 24 * 60;
  const overlap =
    Math.max(0, Math.min(fin, 240) - Math.max(debut, 0)) +
    (fin > 1440 ? Math.max(0, Math.min(fin, 1680) - Math.max(debut, 1440)) : 0);
  return overlap > 0;
}

/**
 * Tronque une chaîne pour l'affichage
 */
export function truncate(str: string, max = 30): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
