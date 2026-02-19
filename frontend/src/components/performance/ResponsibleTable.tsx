import React from "react";
import Badge, { getStatusVariant } from "@/components/ui/Badge";
import type { ResponsavelStats } from "@/types";

interface ResponsibleTableProps {
  data: ResponsavelStats[];
}

export default function ResponsibleTable({ data }: ResponsibleTableProps) {
  const sorted = [...data].sort((a, b) => b.total - a.total);

  if (!sorted.length) {
    return (
      <div className="text-center py-8 text-slate-600 text-sm">
        Nenhum dado disponível
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-100">
          <tr>
            {["Responsável", "Total", "Em Andamento", "Concluído", "Em Atraso", "Concl. Atraso", "Taxa Conclusão"].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {sorted.map(row => {
            const totalFinished = row.concluido + row.concluidoEmAtraso;
            const rate = row.total > 0 ? Math.round((totalFinished / row.total) * 100) : 0;

            return (
              <tr key={row.email} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-slate-800">{row.nome}</div>
                  <div className="text-xs text-slate-600">{row.email}</div>
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-slate-800">{row.total}</td>
                <td className="px-4 py-3">
                  <Badge variant="blue" size="sm">{row.emAndamento}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="green" size="sm">{row.concluido}</Badge>
                </td>
                <td className="px-4 py-3">
                  {row.emAtraso > 0
                    ? <Badge variant="red" size="sm">{row.emAtraso}</Badge>
                    : <span className="text-slate-400 text-xs">—</span>
                  }
                </td>
                <td className="px-4 py-3">
                  {row.concluidoEmAtraso > 0
                    ? <Badge variant="amber" size="sm">{row.concluidoEmAtraso}</Badge>
                    : <span className="text-slate-400 text-xs">—</span>
                  }
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden min-w-[60px]">
                      <div
                        className={`h-full rounded-full ${rate >= 80 ? "bg-emerald-500" : rate >= 50 ? "bg-amber-500" : "bg-rose-500"}`}
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                    <span className={`text-xs font-semibold tabular-nums ${rate >= 80 ? "text-emerald-700" : rate >= 50 ? "text-amber-700" : "text-rose-700"}`}>
                      {rate}%
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
