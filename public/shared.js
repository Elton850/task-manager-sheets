function getToken() { return sessionStorage.getItem("token") || ""; }

async function api(path, options = {}) {
  const token = getToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  try { return JSON.parse(text); }
  catch { return { ok: false, error: "Resposta inválida do servidor", raw: text.slice(0, 200) }; }
}

function logout() {
  sessionStorage.removeItem("token");
  window.location.href = "/";
}

function pillClass(status) {
  const s = (status || "").toLowerCase();
  if (s.includes("atraso")) return "dead";
  if (s.includes("andamento")) return "warn";
  if (s.includes("conclu")) return "ok";
  return "";
}

function fmtDateBR(iso){
  if(!iso) return "";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("pt-BR").format(d);
}

function fmtCompetencia(v){
  const s = String(v || "").trim();
  // aceita "2026-01" e mostra "01/2026"
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${m[2]}/${m[1]}`;
  return s; // se já vier "MM/AAAA"
}

function toISODateFromInput(v){ return v ? new Date(v).toISOString() : ""; }
function isoToInputDate(iso){ return iso ? new Date(iso).toISOString().slice(0,10) : ""; }
function isoToInputDT(iso){
  if(!iso) return "";
  const d = new Date(iso);
  const pad = (n)=> String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}