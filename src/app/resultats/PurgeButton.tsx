"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PurgeButton({ count }: { count: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handlePurge = async () => {
    if (!confirm(`Supprimer les ${count} simulation(s) et tous leurs résultats ? Cette action est irréversible.`)) return;
    setLoading(true);
    try {
      await fetch("/api/simulations", { method: "DELETE" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  if (count === 0) return null;

  return (
    <button
      onClick={handlePurge}
      disabled={loading}
      className="text-sm text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
    >
      {loading ? "Suppression…" : "Purger tout"}
    </button>
  );
}
