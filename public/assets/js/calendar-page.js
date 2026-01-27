let me = null;
let tasks = [];
let monthRef = new Date(); // mês em exibição
let selectedYMD = null;

const $ = (id) => document.getElementById(id);

/* ===== UI: alterna entre calendário e painel do dia ===== */
function showCalendar() {
  selectedYMD = null;
  const dp = $("dayPanel");
  const cp = $("calPanel");
  if (dp) dp.style.display = "none";
  if (cp) cp.style.display = "block";
  renderCalendar();
}

function showDayPanel(ymd) {
  selectedYMD = ymd;
  const dp = $("dayPanel");
  const cp = $("calPanel");
  if (cp) cp.style.display = "none";
  if (dp) dp.style.display = "block";
  renderCalendar();
  renderDayDetails(ymd);
  document.querySelector(".main")?.scrollTo({ top: 0, behavior: "smooth" });
}

function ymdFromDate(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function parseISO(iso){
  if (!iso) return null;
  const s = String(iso).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m){
    const y = Number(m[1]), mm = Number(m[2]), dd = Number(m[3]);
    const d = new Date(y, mm-1, dd); // local (sem bug de timezone)
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function fmtBR(ymd){
  const d = parseISO(ymd);
  if (!d) return ymd || "";
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

function isDoneTask(t){
  return String(t.status||"").toLowerCase().includes("conclu");
}
function isDoneLate(t){
  const p = parseISO(t.prazo);
  const r = parseISO(t.realizado);
  if (!p || !r) return false;
  return isDoneTask(t) && r > p;
}
function isOpenLate(t){
  const p = parseISO(t.prazo);
  if (!p) return false;
  return !isDoneTask(t) && p < new Date();
}

function bucketForTask(t){
  if (isDoneLate(t)) return "DONE_LATE";
  if (isDoneTask(t)) return "DONE";
  if (isOpenLate(t)) return "LATE";
  return "AND";
}

function pillClass(bucket){
  if (bucket === "DONE_LATE") return "p-doneLate";
  if (bucket === "DONE") return "p-done";
  if (bucket === "LATE") return "p-late";
  return "p-and";
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* ===== integração com /app ===== */
function toAppUrl(ymd, bucket){
  const u = new URL(window.location.origin + "/app");
  u.searchParams.set("from", ymd);
  u.searchParams.set("to", ymd);

  const map = {
    AND: "Em Andamento",
    LATE: "Em Atraso",
    DONE: "Concluído",
    DONE_LATE: "Concluído em Atraso",
  };
  if (bucket && map[bucket]) u.searchParams.set("status", map[bucket]);

  return u.toString();
}

function goToTasks(ymd, bucket){
  window.location.href = toAppUrl(ymd, bucket);
}

/* ===== alerts ===== */
function setAlerts(all){
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const addDays = (n)=> new Date(t0.getFullYear(), t0.getMonth(), t0.getDate()+n);

  const inRange = (d, a, b)=> d && d >= a && d <= b;

  const tomorrowA = addDays(1);
  const tomorrowB = addDays(1);

  const d3A = addDays(1), d3B = addDays(3);
  const d7A = addDays(1), d7B = addDays(7);

  let cTomorrow = 0, c3 = 0, c7 = 0, cLate = 0;

  (all||[]).forEach(t=>{
    if (!t.prazo) return;
    if (isDoneTask(t)) return;

    const p = parseISO(t.prazo);
    if (!p) return;

    if (p < t0) cLate++;
    if (inRange(p, tomorrowA, tomorrowB)) cTomorrow++;
    if (inRange(p, d3A, d3B)) c3++;
    if (inRange(p, d7A, d7B)) c7++;
  });

  $("aTomorrow").textContent = cTomorrow;
  $("a3").textContent = c3;
  $("a7").textContent = c7;
  $("aLate").textContent = cLate;
}

/* ===== calendar helpers ===== */
function monthTitle(d){
  return new Intl.DateTimeFormat("pt-BR", { month:"long", year:"numeric" }).format(d);
}

function buildMonthGrid(ref){
  const y = ref.getFullYear();
  const m = ref.getMonth();

  const first = new Date(y, m, 1);
  const last = new Date(y, m+1, 0);

  const startDow = first.getDay(); // 0..6
  const daysInMonth = last.getDate();

  const cells = [];
  for (let i=0;i<42;i++){
    const dayNum = i - startDow + 1;
    const date = new Date(y, m, dayNum);
    const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
    cells.push({ date, inMonth, ymd: ymdFromDate(date) });
  }
  return cells;
}

function groupCountsByDay(all){
  const map = new Map();
  (all||[]).forEach(t=>{
    const ymd = String(t.prazo||"").slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;

    if (!map.has(ymd)) map.set(ymd, { AND:0, LATE:0, DONE:0, DONE_LATE:0, total:0 });
    const o = map.get(ymd);
    o.total++;
    o[bucketForTask(t)]++;
  });
  return map;
}

/* ===== render calendar ===== */
function renderCalendar(){
  $("monthTitle").textContent = monthTitle(monthRef);

  const grid = $("calGrid");
  grid.innerHTML = "";

  const counts = groupCountsByDay(tasks);
  const cells = buildMonthGrid(monthRef);

  const nowYMD = ymdFromDate(new Date());

  cells.forEach(c=>{
    const div = document.createElement("div");
    div.className =
      "dayCell" +
      (c.inMonth ? "" : " muted") +
      (c.ymd === selectedYMD ? " selected" : "") +
      (c.ymd === nowYMD ? " today" : "");

    const info = counts.get(c.ymd) || { AND:0, LATE:0, DONE:0, DONE_LATE:0, total:0 };

    // mini-bar: valores vão via CSS vars (visual-only)
    const barStyle = `--and:${info.AND};--late:${info.LATE};--done:${info.DONE};--doneLate:${info.DONE_LATE};--tot:${info.total};`;

    div.innerHTML = `
      <div class="dayTop">
        <div class="dayNum">${c.date.getDate()}</div>
        <div class="sub">${c.ymd === nowYMD ? "Hoje" : ""}</div>
      </div>

      <div class="miniBar" style="${barStyle}">
        <span class="seg and"></span>
        <span class="seg late"></span>
        <span class="seg done"></span>
        <span class="seg doneLate"></span>
      </div>

      <div class="badges">
        ${info.AND ? `<span class="badge b-and" title="Em Andamento">A: ${info.AND}</span>` : ""}
        ${info.LATE ? `<span class="badge b-late" title="Em Atraso">L: ${info.LATE}</span>` : ""}
        ${info.DONE ? `<span class="badge b-done" title="Concluída">C: ${info.DONE}</span>` : ""}
        ${info.DONE_LATE ? `<span class="badge b-doneLate" title="Concluída em Atraso">CA: ${info.DONE_LATE}</span>` : ""}
      </div>
    `;

    if (c.inMonth){
      div.onclick = ()=> showDayPanel(c.ymd);
    }

    grid.appendChild(div);
  });

  $("hint").textContent =
    `Mês: ${monthTitle(monthRef)} • Tasks com prazo preenchido: ${tasks.filter(t=>t.prazo).length}`;
}

/* ===== render day details ===== */
function renderDayDetails(ymd){
  $("dayTitle").innerHTML = `
    <button class="btn ghost btnBack" id="btnBackCal">← Voltar</button>
    <span style="margin-left:10px;font-weight:950;">Dia ${fmtBR(ymd)} • Prazo</span>
    <span style="margin-left:10px;">
      <a href="${toAppUrl(ymd, "")}" style="color:inherit;text-decoration:underline;opacity:.85">
        Ver no Task Manager
      </a>
    </span>
  `;

  $("btnBackCal").onclick = (e)=>{ e.preventDefault(); showCalendar(); };

  const dayTasks = (tasks||[]).filter(t => String(t.prazo||"").slice(0,10) === ymd);

  const and = [];
  const late = [];
  const done = [];
  const doneLate = [];

  dayTasks.forEach(t=>{
    const b = bucketForTask(t);
    if (b === "DONE_LATE") doneLate.push(t);
    else if (b === "DONE") done.push(t);
    else if (b === "LATE") late.push(t);
    else and.push(t);
  });

  renderList("listAnd", and, "AND", ymd);
  renderList("listLate", late, "LATE", ymd);
  renderList("listDone", done, "DONE", ymd);
  renderList("listDoneLate", doneLate, "DONE_LATE", ymd);
}

function renderList(id, list, bucket, ymd){
  const el = $(id);
  el.innerHTML = "";

  // header clicável
  const col = el.closest(".col");
  if (col){
    const head = col.querySelector(".colHead");
    if (head){
      head.style.cursor = "pointer";
      head.title = "Abrir lista filtrada no Task Manager";
      head.onclick = () => goToTasks(ymd, bucket);
    }
  }

  if (!list.length){
    el.innerHTML = `<div class="sub">Sem atividades</div>`;
    return;
  }

  // ordena
  list = list.slice().sort((a,b)=>{
    const ar = String(a.responsavelNome || a.responsavelEmail || "").toLowerCase();
    const br = String(b.responsavelNome || b.responsavelEmail || "").toLowerCase();
    const c1 = ar.localeCompare(br, "pt-BR");
    if (c1) return c1;
    const aa = String(a.atividade||"").toLowerCase();
    const bb = String(b.atividade||"").toLowerCase();
    return aa.localeCompare(bb, "pt-BR");
  });

  list.forEach(t=>{
    const item = document.createElement("div");
    item.className = "item";
    item.style.cursor = "pointer";
    item.title = "Abrir no Task Manager com filtro deste dia";

    const resp = t.responsavelNome || t.responsavelEmail || "-";
    const st = String(t.status || "");
    const real = t.realizado ? fmtBR(String(t.realizado).slice(0,10)) : "-";

    item.innerHTML = `
      <div class="t">${escapeHtml(t.atividade || "")}</div>
      <div class="m">
        <span class="pill ${pillClass(bucket)}">${escapeHtml(st || bucket)}</span>
        <span>Resp: ${escapeHtml(resp)}</span>
        <span>Real: ${escapeHtml(real)}</span>
      </div>
    `;

    item.onclick = () => goToTasks(ymd, bucket);
    el.appendChild(item);
  });
}

/* ===== bootstrap ===== */
async function bootstrap(){
  const meRes = await api("/api/me");
  if (!meRes || !meRes.ok || !meRes.user) return logout();
  me = meRes.user;

  $("meLine").textContent = `${me.nome || me.email} • ${me.role} • Área: ${me.area || "-"}`;
  $("btnLogout").onclick = (e)=>{ e.preventDefault(); logout(); };

  if (me.role === "ADMIN"){
    const a = document.getElementById("adminLink");
    if (a) a.style.display = "block";
    const u = document.getElementById("usersLink");
    if (u) u.style.display = "block";
  }

  const rulesLink = document.getElementById("rulesLink");
  if (rulesLink && (me.role === "ADMIN" || me.role === "LEADER")) {
    rulesLink.style.display = "block";
  }

  $("btnPrev").onclick = ()=> { monthRef = new Date(monthRef.getFullYear(), monthRef.getMonth()-1, 1); renderCalendar(); };
  $("btnNext").onclick = ()=> { monthRef = new Date(monthRef.getFullYear(), monthRef.getMonth()+1, 1); renderCalendar(); };

  $("btnToday").onclick = ()=> {
    const now = new Date();
    monthRef = new Date(now.getFullYear(), now.getMonth(), 1);
    showDayPanel(ymdFromDate(now)); // hoje já abre o painel do dia
  };

  $("btnRefresh").onclick = ()=> loadTasks();

  // estado inicial
  const dp = $("dayPanel"); if (dp) dp.style.display = "none";
  const cp = $("calPanel"); if (cp) cp.style.display = "block";

  await loadTasks();

  const now = new Date();
  selectedYMD = null;
  monthRef = new Date(now.getFullYear(), now.getMonth(), 1);

  setAlerts(tasks);
  renderCalendar();
}

async function loadTasks(){
  $("hint").textContent = "Carregando...";
  const res = await api("/api/tasks");
  if (!res.ok){ $("hint").textContent = res.error || "Erro"; return; }
  tasks = res.tasks || [];
  setAlerts(tasks);
  renderCalendar();

  // se estiver no modo dia, re-renderiza
  const dp = $("dayPanel");
  if (dp && dp.style.display !== "none" && selectedYMD) {
    renderDayDetails(selectedYMD);
  }
}

document.addEventListener("DOMContentLoaded", bootstrap);
