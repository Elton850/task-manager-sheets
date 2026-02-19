import React from "react";
import { CheckCircle, Clock, AlertCircle, AlertTriangle, BarChart2 } from "lucide-react";
import type { PerformanceSummary } from "@/types";

interface KPICardsProps {
  data: PerformanceSummary;
}

interface KPICard {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bg: string;
  border: string;
  pct?: number;
}

export default function KPICards({ data }: KPICardsProps) {
  const pct = (n: number) => data.total > 0 ? Math.round((n / data.total) * 100) : 0;

  const cards: KPICard[] = [
    {
      label: "Total",
      value: data.total,
      icon: <BarChart2 size={18} />,
      color: "text-slate-700",
      bg: "bg-slate-100",
      border: "border-slate-300",
    },
    {
      label: "Em Andamento",
      value: data.emAndamento,
      pct: pct(data.emAndamento),
      icon: <Clock size={18} />,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
    },
    {
      label: "Concluído",
      value: data.concluido,
      pct: pct(data.concluido),
      icon: <CheckCircle size={18} />,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
    },
    {
      label: "Em Atraso",
      value: data.emAtraso,
      pct: pct(data.emAtraso),
      icon: <AlertCircle size={18} />,
      color: "text-rose-400",
      bg: "bg-rose-500/10",
      border: "border-rose-500/20",
    },
    {
      label: "Concluído em Atraso",
      value: data.concluidoEmAtraso,
      pct: pct(data.concluidoEmAtraso),
      icon: <AlertTriangle size={18} />,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map(card => (
        <div
          key={card.label}
          className={`${card.bg} border ${card.border} rounded-xl p-4`}
        >
          <div className={`${card.color} mb-2`}>{card.icon}</div>
          <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
          <div className="text-xs text-slate-600 mt-0.5 leading-tight font-medium">{card.label}</div>
          {card.pct !== undefined && (
            <div className="mt-2">
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    card.label === "Concluído" ? "bg-emerald-500" :
                    card.label === "Em Atraso" ? "bg-rose-500" :
                    card.label === "Em Andamento" ? "bg-blue-500" : "bg-amber-500"
                  }`}
                  style={{ width: `${card.pct}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-700 mt-0.5 block font-medium">{card.pct}%</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
