let me = null;
let lookups = {};
let users = [];
let tasks = [];
let editingId = null;
let modalMode = "EDIT"; // EDIT | VIEW | USER_OBS
let allowedRecorrencias = []; // vindo da rule da área (USER)

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fillSelect(el, items, { empty = null } = {}) {
  el.innerHTML = "";
  if (empty !== null) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = empty;
    el.appendChild(o);
  }
  (items || []).forEach((v) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    el.appendChild(o);
  });
}

function fillUsersSelect(el, list, { empty = null } = {}) {
  el.innerHTML = "";
  if (empty !== null) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = empty;
    el.appendChild(o);
  }
  (list || []).forEach((u) => {
    const o = document.createElement("option");
    o.value = u.email;
    o.textContent = `${u.nome || u.email}`;
    el.appendChild(o);
  });
}

/* ===== date helpers (SEM timezone bug) ===== */
function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23,59,59,999); return x; }

// YYYY-MM-DD -> Date local (evita voltar 1 dia)
function parseISO(iso) {
  if (!iso) return null;
  const s = String(iso).trim();

  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]), mm = Number(m[2]), dd = Number(m[3]);
    const d = new Date(y, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Formata para DD/MM/AAAA sem criar Date em UTC
function fmtDateBR(v) {
  if (!v) return "";
  const s = String(v).trim();

  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;

  const d = parseISO(s);
  if (!d) return s;

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

// Para input type="date" (YYYY-MM-DD)
function toInputDate(v) {
  if (!v) return "";
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = parseISO(s);
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ===== Sorting ===== */
const SORT_FIELDS = [
  { value: "prazo", label: "Prazo" },
  { value: "status", label: "Status" },
  { value: "responsavel", label: "Responsável" },
  { value: "atividade", label: "Atividade" },
  { value: "competencia", label: "Competência" },
  { value: "tipo", label: "Tipo" },
  { value: "recorrencia", label: "Recorrência" },
  { value: "realizado", label: "Realizado" },
];

function fillSortSelect() {
  const el = $("fSort");
  if (!el) return;
  el.innerHTML = "";
  SORT_FIELDS.forEach((f) => {
    const o = document.createElement("option");
    o.value = f.value;
    o.textContent = f.label;
    el.appendChild(o);
  });
  el.value = "prazo"; // padrão
  const dir = $("fDir");
  if (dir) dir.value = "asc";
}

function normStr(v) { return String(v || "").trim().toLowerCase(); }

function sortTasks(list) {
  const key = ($("fSort")?.value || "prazo").trim();
  const dir = ($("fDir")?.value || "asc").trim();
  const mult = dir === "desc" ? -1 : 1;

  const getDate = (v) => {
    const d = parseISO(v);
    return d ? d.getTime() : null;
  };

  const getComp = (t) => {
    const s = String(t.competenciaYm || t.competencia || "").trim();
    return s;
  };

  const base = (list || []).slice();
  base.sort((a, b) => {
    const fallback = () => {
      const ap = getDate(a.prazo), bp = getDate(b.prazo);
      if (ap != null && bp != null && ap !== bp) return (ap - bp) * mult;
      if (ap == null && bp != null) return 1;
      if (ap != null && bp == null) return -1;

      const aa = normStr(a.atividade), bb = normStr(b.atividade);
      const c = aa.localeCompare(bb, "pt-BR");
      if (c) return c * mult;
      return 0;
    };

    if (key === "prazo") {
      const ap = getDate(a.prazo), bp = getDate(b.prazo);
      if (ap != null && bp != null && ap !== bp) return (ap - bp) * mult;
      if (ap == null && bp != null) return 1;
      if (ap != null && bp == null) return -1;
      return fallback();
    }

    if (key === "realizado") {
      const ar = getDate(a.realizado), br = getDate(b.realizado);
      if (ar != null && br != null && ar !== br) return (ar - br) * mult;
      if (ar == null && br != null) return 1;
      if (ar != null && br == null) return -1;
      return fallback();
    }

    if (key === "competencia") {
      const ac = getComp(a), bc = getComp(b);
      const c = ac.localeCompare(bc, "pt-BR");
      if (c) return c * mult;
      return fallback();
    }

    if (key === "responsavel") {
      const ar = normStr(a.responsavelNome || a.responsavelEmail);
      const br = normStr(b.responsavelNome || b.responsavelEmail);
      const c = ar.localeCompare(br, "pt-BR");
      if (c) return c * mult;
      return fallback();
    }

    if (key === "atividade") {
      const aa = normStr(a.atividade), bb = normStr(b.atividade);
      const c = aa.localeCompare(bb, "pt-BR");
      if (c) return c * mult;
      return fallback();
    }

    if (key === "status") {
      const as = normStr(a.status), bs = normStr(b.status);
      const c = as.localeCompare(bs, "pt-BR");
      if (c) return c * mult;
      return fallback();
    }

    if (key === "tipo") {
      const at = normStr(a.tipo), bt = normStr(b.tipo);
      const c = at.localeCompare(bt, "pt-BR");
      if (c) return c * mult;
      return fallback();
    }

    if (key === "recorrencia") {
      const ar = normStr(a.recorrencia), br = normStr(b.recorrencia);
      const c = ar.localeCompare(br, "pt-BR");
      if (c) return c * mult;
      return fallback();
    }

    return fallback();
  });

  return base;
}

function applyFilters(list) {
  const ativ = ($("fAtiv")?.value || "").trim().toLowerCase();
  const status = ($("fStatus")?.value || "").trim();
  const resp = ($("fResp")?.value || "").trim();
  const fromStr = $("fFrom")?.value || "";
  const toStr = $("fTo")?.value || "";

  const from = fromStr ? startOfDay(parseISO(fromStr)) : null;
  const to = toStr ? endOfDay(parseISO(toStr)) : null;

  const filtered = (list || []).filter((t) => {
    if (ativ) {
      const a = String(t.atividade || "").toLowerCase();
      if (!a.includes(ativ)) return false;
    }

    if (status) {
      if (status === "Em Atraso") {
        const prazo = parseISO(t.prazo);
        if (!prazo || prazo >= new Date()) return false;
        if (isDoneTask(t)) return false;
      }
      else if (status === "Concluído em Atraso") {
        if (!isDoneLate(t)) return false;
      }
      else {
        if (String(t.status || "") !== status) return false;
      }
    }

    if (resp && String(t.responsavelEmail || "").toLowerCase() !== resp.toLowerCase()) return false;

    const p = parseISO(t.prazo);
    if (from && (!p || p < from)) return false;
    if (to && (!p || p > to)) return false;

    return true;
  });

  return sortTasks(filtered);
}

function isDoneTask(t) {
  const s = String(t.status || "").toLowerCase();
  return s.includes("conclu");
}

function isDoneLate(t) {
  const prazo = parseISO(t.prazo);
  const real = parseISO(t.realizado);
  if (!prazo || !real) return false;
  return isDoneTask(t) && real > prazo;
}

function isOpenLate(t) {
  const prazo = parseISO(t.prazo);
  if (!prazo) return false;
  return !isDoneTask(t) && prazo < new Date();
}

/* Competência selects */
function setupCompetenciaSelects() {
  const months = ["01","02","03","04","05","06","07","08","09","10","11","12"];
  const monthNames = months.map((mm, i) =>
    new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(2026, i, 1))
  );

  const mMes = $("mCompMes");
  mMes.innerHTML = "";
  months.forEach((mm, i) => {
    const o = document.createElement("option");
    o.value = mm;
    o.textContent = monthNames[i];
    mMes.appendChild(o);
  });

  const yearNow = new Date().getFullYear();
  const mAno = $("mCompAno");
  mAno.innerHTML = "";
  for (let y = yearNow - 2; y <= yearNow + 3; y++) {
    const o = document.createElement("option");
    o.value = String(y);
    o.textContent = String(y);
    mAno.appendChild(o);
  }
}

function setCompetenciaDefaultToday() {
  const now = new Date();
  $("mCompMes").value = String(now.getMonth() + 1).padStart(2, "0");
  $("mCompAno").value = String(now.getFullYear());
}

function setCompetenciaFromTask(t) {
  const ym = String(t.competenciaYm || t.competencia || "").trim();
  if (ym.match(/^\d{4}-\d{1,2}$/)) {
    $("mCompAno").value = ym.slice(0, 4);
    $("mCompMes").value = String(Number(ym.slice(5))).padStart(2, "0");
  } else setCompetenciaDefaultToday();
}

/* Optimistic helpers */
function upsertLocalTask(task) {
  if (!task || !task.id) return;
  const i = tasks.findIndex((x) => x.id === task.id);
  if (i >= 0) tasks[i] = task;
  else tasks.unshift(task);
}
function removeLocalTask(id) {
  tasks = tasks.filter((t) => t.id !== id);
}
function renderFromLocal() {
  const filtered = applyFilters(tasks);

  renderKPIs(filtered);        // cards “normais” seguem filtro
  renderLateGlobal(tasks);     // Em Atraso GLOBAL (ignora filtros)

  renderTable(filtered);
  $("hint").textContent = `Mostrando: ${filtered.length} de ${tasks.length}`;
}

/* ===== URL filters (vindo do Calendário) ===== */
function applyUrlFiltersIfAny() {
  const qs = new URLSearchParams(window.location.search);
  const from = qs.get("from");
  const to = qs.get("to");
  const status = qs.get("status");

  let changed = false;

  if (from && $("fFrom")) { $("fFrom").value = from; changed = true; }
  if (to && $("fTo")) { $("fTo").value = to; changed = true; }

  if (status && $("fStatus")) {
    const ok = Array.from($("fStatus").options).some(o => o.value === status);
    if (ok) { $("fStatus").value = status; changed = true; }
  }

  if (changed) renderFromLocal();
}

/* Bootstrap */
async function bootstrap() {
  const meRes = await api("/api/me");
  if (!meRes || !meRes.ok || !meRes.user) return logout();
  me = meRes.user;

  $("meLine").textContent = `${me.nome || me.email} • ${me.role} • Área: ${me.area || "-"}`;
  $("btnLogout").onclick = (e) => { e.preventDefault(); logout(); };

  if (me.role === "ADMIN") {
    const a = document.getElementById("adminLink");
    if (a) a.style.display = "block";
    const u = document.getElementById("usersLink");
    if (u) u.style.display = "block";
  }
  
  const rulesLink = document.getElementById("rulesLink");
  if (rulesLink && (me.role === "ADMIN" || me.role === "LEADER")) {
    rulesLink.style.display = "block";
  }

  if (me.role === "USER") {
    const btnNew = document.getElementById("btnNew");
    if (btnNew) btnNew.style.display = "inline-block";
  }

  const calls = [api("/api/lookups"), api("/api/users")];
  if (me.role === "USER") calls.push(api("/api/rules"));

  const [lres, ures, rres] = await Promise.all(calls);

  lookups = (lres && lres.ok && lres.lookups) ? lres.lookups : {};
  users = (ures && ures.ok && ures.users) ? ures.users : [];

  allowedRecorrencias = [];
  if (me.role === "USER") {
    allowedRecorrencias = (rres && rres.ok && Array.isArray(rres.allowedRecorrencias))
      ? rres.allowedRecorrencias
      : [];
  }

  lookups = (lres && lres.ok && lres.lookups) ? lres.lookups : {};
  users = (ures && ures.ok && ures.users) ? ures.users : [];

  // filtros default (hoje)
  const today = new Date();
  const todayYMD = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  $("fFrom").value = todayYMD;
  $("fTo").value = todayYMD;

  // status
  const statusFilter = [
    ...(lookups.STATUS || []),
    "Em Atraso",
    "Concluído em Atraso"
  ];
  fillSelect($("fStatus"), statusFilter, { empty: "Todos" });

  // sort
  fillSortSelect();

  // responsável
  const fResp = $("fResp");
  if (fResp) {
    const wrap = fResp.closest(".field");
    if (me.role === "USER") {
      if (wrap) wrap.remove();
    } else {
      fillUsersSelect(fResp, users, { empty: "Todos responsáveis" });
    }
  }

  setupCompetenciaSelects();
  
  if (me.role === "USER") {
  // USER: somente permitidas
  fillSelect($("mRecorrencia"), allowedRecorrencias || [], { empty: "Selecione..." });
  } else {
    // ADMIN/LEADER: todas
    fillSelect($("mRecorrencia"), lookups.RECORRENCIA || []);
  }

  fillSelect($("mTipo"), lookups.TIPO || []);
  fillSelect($("mStatus"), lookups.STATUS || []);
  fillUsersSelect($("mResp"), users);

  $("btnNew").onclick = () => openModalNew();
  $("btnRefresh").onclick = () => loadTasks();
  $("btnFilter").onclick = () => renderFromLocal();
  $("fAtiv")?.addEventListener("input", () => renderFromLocal());
  $("fSort")?.addEventListener("change", () => renderFromLocal());
  $("fDir")?.addEventListener("change", () => renderFromLocal());

  $("mClose").onclick = () => closeModal();
  $("mCancel").onclick = () => closeModal();
  $("mSave").onclick = () => saveTask();
  $("mClearReal").onclick = () => clearRealizado();

  await loadTasks();

  // aplica filtros vindos do Calendário (se existir querystring)
  applyUrlFiltersIfAny();
}

/* load + render */
async function loadTasks() {
  $("hint").textContent = "Carregando...";
  const res = await api("/api/tasks");
  if (!res.ok) { $("hint").textContent = res.error || "Erro"; return; }
  tasks = res.tasks || [];
  renderFromLocal();
}

/* KPIs: seguem filtro */
function renderKPIs(list) {
  const total = list.length;

  const and = list.filter((t) =>
    String(t.status || "").toLowerCase().includes("andamento")
  ).length;

  const doneLate = list.filter((t) => isDoneLate(t)).length;

  // Concluídas SEM atraso
  const done = list.filter((t) => isDoneTask(t) && !isDoneLate(t)).length;

  $("kTotal").textContent = total;
  $("kAnd").textContent = and;
  $("kDone").textContent = done;
  if ($("kDoneLate")) $("kDoneLate").textContent = doneLate;
}

/* “Em Atraso” GLOBAL: ignora filtros */
function renderLateGlobal(allTasks) {
  const late = (allTasks || []).filter((t) => isOpenLate(t)).length;
  $("kLate").textContent = late;
}

function renderTable(list) {
  const tb = $("tb");
  tb.innerHTML = "";

  (list || []).forEach((t) => {
    const tr = document.createElement("tr");

    const resp = t.responsavelNome || t.responsavelEmail || "";

    const obs = String(t.observacoes || "").trim();
    const obsShort = obs.length > 120 ? obs.slice(0, 120) + "…" : obs;
    const activity = String(t.atividade || "");

    tr.innerHTML = `
      <td class="col-comp">${fmtCompetencia(t.competenciaYm || t.competencia)}</td>
      <td class="col-rec">${escapeHtml(t.recorrencia || "")}</td>
      <td class="col-tipo">${escapeHtml(t.tipo || "")}</td>

      <td class="col-atividade" title="${escapeHtml(activity)}">
        <div class="atividadeCell ${obs ? "hasObs" : ""}">
          <span class="atividadeText">${escapeHtml(activity)}</span>
          ${obs ? `<span class="obsIcon" title="${escapeHtml(obsShort)}">🗒</span>` : ""}
        </div>
      </td>

      <td class="col-resp" title="${escapeHtml(resp)}">
        <span class="cellText">${escapeHtml(resp)}</span>
      </td>

      <td class="col-prazo">${fmtDateBR(t.prazo)}</td>
      <td class="col-real">${t.realizado ? fmtDateBR(t.realizado) : ""}</td>

      <td class="col-status">
        <span class="pill ${pillClass(t.status)}" title="${escapeHtml(String(t.status || ""))}">
          ${escapeHtml(String(t.status || ""))}
        </span>
      </td>

      <td class="col-acoes"></td>
    `;

    const td = tr.querySelector("td:last-child");
    const row = document.createElement("div");
    row.className = "rowActions";

    const bDone = document.createElement("button");
    bDone.className = "sm";
    bDone.title = isDoneTask(t) ? "Reabrir" : "Concluir";
    bDone.textContent = isDoneTask(t) ? "↩" : "✅";
    bDone.onclick = async () => toggleDone(t);
    row.appendChild(bDone);

    if (me.role === "USER") {
      const bView = document.createElement("button");
      bView.className = "sm";
      bView.title = "Ver / Observações";
      bView.textContent = "👁";
      bView.onclick = () => openModalUserObs(t.id);
      row.appendChild(bView);

      td.appendChild(row);
      tb.appendChild(tr);
      return;
    }

    const bEdit = document.createElement("button");
    bEdit.className = "sm";
    bEdit.title = "Editar";
    bEdit.textContent = "✏️";
    bEdit.onclick = () => openModalEdit(t.id);
    row.appendChild(bEdit);

    const bDup = document.createElement("button");
    bDup.className = "sm";
    bDup.title = "Duplicar";
    bDup.textContent = "⧉";
    bDup.onclick = async () => {
      const n = Number(prompt("Quantas cópias duplicar?", "1") || "0");
      if (!Number.isFinite(n) || n <= 0) return;

      bDup.disabled = true;
      const prev = $("hint").textContent;
      $("hint").textContent = `Duplicando (${n})...`;

      try {
        for (let i = 0; i < n; i++) {
          const r = await api(`/api/tasks/${t.id}/duplicate`, { method: "POST" });
          if (!r.ok) {
            $("hint").textContent = prev || "";
            return alert(r.error || "Erro");
          }
          if (r.task) tasks.unshift(r.task);
        }
        renderFromLocal();
      } finally {
        bDup.disabled = false;
      }
    };
    row.appendChild(bDup);

    const bDel = document.createElement("button");
    bDel.className = "sm danger";
    bDel.title = "Excluir";
    bDel.textContent = "🗑";
    bDel.onclick = async () => {
      if (!confirm("Excluir task?")) return;

      bDel.disabled = true;
      const prev = $("hint").textContent;
      $("hint").textContent = "Excluindo...";

      try {
        const r = await api(`/api/tasks/${t.id}`, { method: "DELETE" });
        if (!r.ok) {
          $("hint").textContent = prev || "";
          return alert(r.error || "Erro");
        }
        removeLocalTask(t.id);
        renderFromLocal();
      } finally {
        bDel.disabled = false;
      }
    };
    row.appendChild(bDel);

    td.appendChild(row);
    tb.appendChild(tr);
  });
}

async function toggleDone(t) {
  const done = isDoneTask(t);

  // manda YYYY-MM-DD (sem timezone)
  const today = new Date();
  const todayYMD = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

  const patch = done
    ? { status: "Em Andamento", realizado: "CLEAR" }
    : { status: "Concluído", realizado: todayYMD };

  const before = { ...t };

  if (done) { t.status = "Em Andamento"; t.realizado = ""; }
  else { t.status = "Concluído"; t.realizado = patch.realizado; }

  renderFromLocal();

  const r = await api(`/api/tasks/${t.id}`, { method: "PUT", body: JSON.stringify(patch) });
  if (!r.ok) {
    upsertLocalTask(before);
    renderFromLocal();
    return alert(r.error || "Erro");
  }
  if (r.task) upsertLocalTask(r.task);
  renderFromLocal();
}

/* modal modes */
function setModalMode(mode) {
  modalMode = mode;

  const all = ["mCompMes","mCompAno","mRecorrencia","mTipo","mStatus","mResp","mAtividade","mPrazo","mRealizado","mObs"];
  all.forEach((id) => { const el = document.getElementById(id); if (el) el.disabled = true; });

  const save = document.getElementById("mSave");
  const clear = document.getElementById("mClearReal");
  if (clear) clear.style.display = "none";

  if (mode === "EDIT") {
    all.forEach((id) => { const el = document.getElementById(id); if (el) el.disabled = false; });
    if (save) save.style.display = "inline-block";
    if (clear) clear.style.display = "inline-block";
    return;
  }

  if (mode === "VIEW") {
    if (save) save.style.display = "none";
    return;
  }

  if (mode === "USER_OBS") {
    const obs = document.getElementById("mObs");
    if (obs) obs.disabled = false;
    if (save) save.style.display = "inline-block";
  }

  if (mode === "USER_NEW") {
    // USER pode criar: competência, recorrência (filtrada), tipo, atividade, prazo, obs
    ["mCompMes","mCompAno","mRecorrencia","mTipo","mAtividade","mPrazo","mObs"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = false;
    });

    // trava campos que USER não mexe na criação
    ["mStatus","mResp","mRealizado"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = true;
    });

    if (save) save.style.display = "inline-block";
    if (clear) clear.style.display = "none";
    return;
  }
}

function openModalNew() {
  editingId = null;
  $("mTitle").textContent = "Nova task";
  $("mHint").textContent = "";

  setCompetenciaDefaultToday();

  // defaults
  $("mTipo").value = (lookups.TIPO || [])[0] || "";
  $("mAtividade").value = "";
  $("mPrazo").value = "";
  $("mObs").value = "";
  $("mRealizado").value = "";

  if (me.role === "USER") {
    // Recorrência: somente permitidas
    fillSelect($("mRecorrencia"), allowedRecorrencias || [], { empty: "Selecione..." });

    if (!allowedRecorrencias || !allowedRecorrencias.length) {
      $("mHint").textContent = "Sua área não tem recorrências liberadas. Fale com o Leader/Admin.";
      // trava salvar
      setModalMode("VIEW");
      $("modal").classList.add("show");
      return;
    }

    // trava/define status e responsável
    $("mStatus").value = "Em Andamento";
    $("mResp").value = me.email;

    setModalMode("USER_NEW");
    $("modal").classList.add("show");
    return;
  }

  // ADMIN/LEADER mantém comportamento antigo
  $("mRecorrencia").value = (lookups.RECORRENCIA || [])[0] || "";
  $("mStatus").value = (lookups.STATUS || [])[0] || "";
  $("mResp").value = me.email;

  setModalMode("EDIT");
  $("modal").classList.add("show");
}

function openModalEdit(id) {
  if (me.role === "USER") return;

  const t = tasks.find((x) => x.id === id);
  if (!t) return;

  editingId = id;
  $("mTitle").textContent = "Editar task";
  $("mHint").textContent = "";

  setCompetenciaFromTask(t);

  $("mRecorrencia").value = t.recorrencia || "";
  $("mTipo").value = t.tipo || "";
  $("mStatus").value = t.status || "";
  $("mResp").value = t.responsavelEmail || "";

  $("mAtividade").value = t.atividade || "";
  $("mPrazo").value = toInputDate(t.prazo);
  $("mRealizado").value = t.realizado ? isoToInputDT(t.realizado) : "";
  $("mObs").value = t.observacoes || "";

  setModalMode("EDIT");
  $("modal").classList.add("show");
}

function openModalUserObs(id) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;

  editingId = id;
  $("mTitle").textContent = "Observações";
  $("mHint").textContent = "Você pode editar apenas Observações.";

  setCompetenciaFromTask(t);

  $("mRecorrencia").value = t.recorrencia || "";
  $("mTipo").value = t.tipo || "";
  $("mStatus").value = t.status || "";
  $("mResp").value = t.responsavelEmail || "";

  $("mAtividade").value = t.atividade || "";
  $("mPrazo").value = toInputDate(t.prazo);
  $("mRealizado").value = t.realizado ? isoToInputDT(t.realizado) : "";
  $("mObs").value = t.observacoes || "";

  setModalMode("USER_OBS");
  $("modal").classList.add("show");
}

function closeModal() {
  $("modal").classList.remove("show");
}

/* save */
async function saveTask() {
  $("mHint").textContent = "Salvando...";

 if (me.role === "USER") {
    // 1) se estiver editando uma task existente: continua só OBS
    if (editingId) {
      const payload = { observacoes: ($("mObs").value || "").trim() };
      const res = await api(`/api/tasks/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      if (!res.ok) { $("mHint").textContent = res.error || "Erro"; return; }
      closeModal();
      if (res.task) upsertLocalTask(res.task);
      renderFromLocal();
      return;
    }

    // 2) criação nova (POST) com rules já aplicadas no select
    const competenciaYm = `${$("mCompAno").value}-${$("mCompMes").value}`;
    const recorrencia = $("mRecorrencia").value || "";
    const tipo = $("mTipo").value || "";
    const atividade = ($("mAtividade").value || "").trim();
    const prazo = $("mPrazo").value || "";
    const observacoes = ($("mObs").value || "").trim();

    if (!recorrencia) { $("mHint").textContent = "Selecione a recorrência."; return; }
    if (!tipo) { $("mHint").textContent = "Selecione o tipo."; return; }
    if (!atividade) { $("mHint").textContent = "Atividade é obrigatória."; return; }

    const payload = {
      competenciaYm,
      recorrencia,
      tipo,
      status: "Em Andamento",
      responsavelEmail: me.email,
      atividade,
      prazo,
      realizado: "",
      observacoes,
    };

    const res = await api(`/api/tasks`, { method: "POST", body: JSON.stringify(payload) });
    if (!res.ok) { $("mHint").textContent = res.error || "Erro"; return; }

    closeModal();
    if (res.task) upsertLocalTask(res.task);
    else await loadTasks();
    renderFromLocal();
    return;
  }
}

async function clearRealizado() {
  if (me.role === "USER") return;
  if (!editingId) { $("mRealizado").value = ""; return; }

  const res = await api(`/api/tasks/${editingId}`, {
    method: "PUT",
    body: JSON.stringify({ realizado: "CLEAR" }),
  });

  if (!res.ok) return alert(res.error || "Erro");

  closeModal();
  if (res.task) upsertLocalTask(res.task);
  else await loadTasks();
  renderFromLocal();
}

document.addEventListener("DOMContentLoaded", bootstrap);