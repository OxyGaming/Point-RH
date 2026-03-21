"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface ImportResult {
  success: boolean;
  importId?: string;
  nbLignes: number;
  nbAgents: number;
  fileType?: "excel" | "txt";
  erreurs: { ligne: number; champ?: string; message: string }[];
  error?: string;
}

export default function ImportForm() {
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

    try {
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const data: ImportResult = await res.json();
      setResult(data);
      if (data.success) {
        setTimeout(() => router.push("/agents"), 1500);
      }
    } catch {
      setResult({ success: false, nbLignes: 0, nbAgents: 0, erreurs: [], error: "Erreur réseau" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Drop zone */}
        <div
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
            dragOver ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"
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
          <div className="text-4xl mb-3">📥</div>
          {file ? (
            <div>
              <p className="font-semibold text-gray-800">{file.name}</p>
              <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} Ko</p>
            </div>
          ) : (
            <div>
              <p className="text-gray-700 font-medium">Glissez votre fichier ici</p>
              <p className="text-sm text-gray-500 mt-1">ou cliquez pour sélectionner (.xlsx, .xls, .txt)</p>
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

      {/* Result */}
      {result && (
        <div className={`mt-6 rounded-xl p-5 border ${result.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
          {result.success ? (
            <div>
              <p className="font-semibold text-green-800 mb-1">✅ Import réussi</p>
              <p className="text-sm text-green-700">{result.nbLignes} lignes importées — {result.nbAgents} agents</p>
              {result.fileType && (
                <p className="text-xs text-green-600 mt-0.5">
                  Format détecté : {result.fileType === "excel" ? "Excel" : "TXT tabulé"}
                </p>
              )}
              {result.erreurs.length > 0 && (
                <p className="text-sm text-yellow-700 mt-1">{result.erreurs.length} avertissement(s)</p>
              )}
            </div>
          ) : (
            <div>
              <p className="font-semibold text-red-800 mb-2">❌ Échec de l&apos;import</p>
              <p className="text-sm text-red-700">{result.error}</p>
            </div>
          )}
          {result.erreurs.length > 0 && (
            <div className="mt-3 max-h-40 overflow-y-auto space-y-1">
              {result.erreurs.map((e, i) => (
                <div key={i} className="text-xs text-yellow-800 bg-yellow-50 rounded px-2 py-1">
                  Ligne {e.ligne}{e.champ ? ` [${e.champ}]` : ""} — {e.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
