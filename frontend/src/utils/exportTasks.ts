import type { Task } from "@/types";

const CSV_SEP = ";";
const CSV_QUOTE = '"';

function escapeCsv(value: string): string {
  const s = String(value ?? "").replace(/"/g, '""');
  return s.includes(CSV_SEP) || s.includes("\n") || s.includes("\r") ? `${CSV_QUOTE}${s}${CSV_QUOTE}` : s;
}

function formatDate(ymd: string): string {
  if (!ymd) return "—";
  try {
    return new Date(ymd + "T00:00:00").toLocaleDateString("pt-BR");
  } catch {
    return ymd;
  }
}

const COLUMNS: { key: keyof Task | "prazoFmt" | "realizadoFmt"; label: string }[] = [
  { key: "competenciaYm", label: "Competência" },
  { key: "atividade", label: "Atividade" },
  { key: "recorrencia", label: "Recorrência" },
  { key: "tipo", label: "Tipo" },
  { key: "area", label: "Área" },
  { key: "responsavelNome", label: "Responsável" },
  { key: "prazoFmt", label: "Prazo" },
  { key: "status", label: "Status" },
  { key: "realizadoFmt", label: "Realizado" },
  { key: "observacoes", label: "Observações" },
];

function taskToRow(t: Task): Record<string, string> {
  return {
    competenciaYm: t.competenciaYm,
    atividade: t.atividade ?? "",
    recorrencia: t.recorrencia ?? "",
    tipo: t.tipo ?? "",
    area: t.area ?? "",
    responsavelNome: t.responsavelNome ?? "",
    prazoFmt: formatDate(t.prazo),
    status: t.status ?? "",
    realizadoFmt: formatDate(t.realizado),
    observacoes: (t.observacoes ?? "").replace(/\s+/g, " ").trim(),
  };
}

/** Gera e faz download do CSV das tarefas (UTF-8 com BOM para Excel). */
export function exportTasksToCsv(tasks: Task[], filenameBase = "tarefas"): void {
  const header = COLUMNS.map(c => escapeCsv(c.label)).join(CSV_SEP);
  const rows = tasks.map(t => {
    const row = taskToRow(t);
    return COLUMNS.map(c => escapeCsv(row[c.key as keyof typeof row] ?? "")).join(CSV_SEP);
  });
  const bom = "\uFEFF";
  const csv = bom + header + "\r\n" + rows.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameBase}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Gera e faz download do PDF das tarefas em tabela. */
export function exportTasksToPdf(tasks: Task[], filenameBase = "tarefas"): void {
  import("jspdf").then(({ jsPDF }) => {
    import("jspdf-autotable").then(({ default: autoTable }) => {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const headers = COLUMNS.map(c => c.label);
      const rows = tasks.map(t => {
        const row = taskToRow(t);
        return COLUMNS.map(c => row[c.key as keyof typeof row] ?? "");
      });

      doc.setFontSize(12);
      doc.text("Tarefas exportadas", 14, 12);
      doc.setFontSize(9);

      autoTable(doc, {
        head: [headers],
        body: rows,
        startY: 18,
        margin: { left: 14, right: 14 },
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [71, 85, 105], textColor: 255 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });

      const pageHeight = (doc as unknown as { internal: { pageSize: { getHeight: () => number } } }).internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.text(`Total: ${tasks.length} tarefa(s) • ${new Date().toLocaleDateString("pt-BR")}`, 14, pageHeight - 8);

      doc.save(`${filenameBase}_${new Date().toISOString().slice(0, 10)}.pdf`);
    });
  });
}
