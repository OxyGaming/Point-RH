"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { IconDownload } from "@/components/icons/Icons";
import type { ImportResult } from "@/types/planning";
import ImportResultMessage from "./ImportResultMessage";
import HabilitationsProposalsPanel from "./HabilitationsProposalsPanel";

interface Props {
  isAdmin: boolean;
}

export default function ImportForm({ isAdmin }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (f: File) => {
    setFile(f);
    setResult(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setResult(null);

    const fd = new FormData();
    fd.append("file", file);

    const emptyResult = {
      success: false as const,
      lignesCreees: 0, lignesMisesAJour: 0,
      agentsCreated: 0, agentsUpdated: 0,
    };

    try {
      const res = await fetch("/api/import", { method: "POST", body: fd });

      const contentType = res.headers.get("content-type") ?? "";
      const isJson = contentType.includes("application/json");

      if (!isJson) {
        const text = await res.text().catch(() => "");
        const snippet = text.slice(0, 200).replace(/\s+/g, " ").trim();
        setResult({
          ...emptyResult,
          erreurs: [{
            ligne: 0,
            message: `HTTP ${res.status} — réponse non-JSON${snippet ? ` : ${snippet}` : ""}`,
          }],
        });
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        setResult({
          ...emptyResult,
          erreurs: [{
            ligne: 0,
            message: `HTTP ${res.status}${data?.error ? ` — ${data.error}` : ""}`,
          }],
        });
        return;
      }

      setResult(data as ImportResult);
      if (data.success) {
        router.refresh();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setResult({
        ...emptyResult,
        erreurs: [{ ligne: 0, message: `Erreur réseau — ${message}` }],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
            dragOver
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"
          }`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.txt"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <IconDownload className="w-10 h-10 mb-3 mx-auto text-slate-500" aria-hidden="true" />
          {file ? (
            <div>
              <p className="font-semibold text-gray-800">{file.name}</p>
              <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} Ko</p>
            </div>
          ) : (
            <div>
              <p className="text-gray-700 font-medium">Glissez votre fichier ici</p>
              <p className="text-sm text-gray-500 mt-1">
                ou cliquez pour sélectionner (.xlsx, .xls, .txt)
              </p>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={!file || loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
        >
          {loading ? "Import en cours…" : "Importer le planning"}
        </button>
      </form>

      {result && <ImportResultMessage result={result} />}
      {result?.success && isAdmin && <HabilitationsProposalsPanel />}
    </div>
  );
}
