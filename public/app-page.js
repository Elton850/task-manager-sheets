let me = null;
let lookups = {};
let users = [];
let tasks = [];
let editingId = null;

const $ = (id) => document.getElementById(id);

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

function fillUsers(el, list) {
  el.innerHTML = "";
  (list || []).forEach((u) => {
    const o = document.createElement("option");
    o.value = u.email;
    o.textContent = `${u.nome || u.email} • ${u.area || "-"}`;
    el.appendChild(o);
  });
}

/* =========================
   Date helpers (filters/KPI)
========================= */
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function parseISO(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function applyFilters(list) {
  const status = ($("fStatus").value || "").trim();
  const fromStr = $("fFrom").value;
  const toStr = $("fTo").value;

  const from = fromStr ? startOfDay(new Date(fromStr)) : null;
  const to = toStr ? endOfDay(new Date(toStr)) : null;

  return (list || []).filter((t) => {
    if (status && String(t.status || "") !== status) return false;

    const p = parseISO(t.prazo);
    if (from && (!p || p < from)) return false;
    if (to && (!p || p > to)) return false;

    return true;
  });
}

/* =========================
   Bootstrap
========================= */
async function bootstrap() {
  const meRes = await api("/api/me");
  if (!meRes || !meRes.ok || !meRes.user) return logout();
  me = meRes.user;

  $("meLine").textContent = `${me.nome || me.email} • ${me.role} • Área: ${me.area || "-"}`;
  $("btnLogout").onclick = (e) => {
    e.preventDefault();
    logout();
  };

  if (me.role === "ADMIN") {
    const a = document.getElementById("adminLink");
    if (a) a.style.display = "block";
    const u = document.getElementById("usersLink");
    if (u) u.style.display = "block";
  }

  const [lres, ures] = await Promise.all([api("/api/lookups"), api("/api/users")]);
  lookups = lres && lres.ok && lres.lookups ? lres.lookups : {};
  users = ures && ures.ok && ures.users ? ures.users : [];

  // filtros: default = hoje
  const today = new Date();
  $("fFrom").value = today.toISOString().slice(0, 10);
  $("fTo").value = today.toISOString().slice(0, 10);

  fillSelect($("fStatus"), lookups.STATUS || [], { empty: "Todos" });

  // modal selects
  fillSelect($("mCompetencia"), lookups.COMPETENCIA || [], { empty: "—" });
  fillSelect($("mRecorrencia"), lookups.RECORRENCIA || []);
  fillSelect($("mTipo"), lookups.TIPO || []);
  fillSelect($("mStatus"), lookups.STATUS || []);
  fillUsers($("mResp"), users);

  // eventos
  $("btnNew").onclick = () => openModalNew();
  $("btnRefresh").onclick = () => loadTasks();
  $("btnFilter").onclick = () => {
    const filtered = applyFilters(tasks);
    renderKPIs(filtered);
    renderTable(filtered);
    $("hint").textContent = `Mostrando: ${filtered.length} de ${tasks.length}`;
  };

  $("mClose").onclick = () => closeModal();
  $("mCancel").onclick = () => closeModal();
  $("mSave").onclick = () => saveTask();
  $("mClearReal").onclick = () => clearRealizado();

  await loadTasks();
}

/* =========================
   Load + Render
========================= */
async function loadTasks() {
  $("hint").textContent = "Carregando...";
  const res = await api("/api/tasks");
  if (!res.ok) {
    $("hint").textContent = res.error || "Erro";
    return;
  }

  tasks = res.tasks || [];
  const filtered = applyFilters(tasks);

  renderKPIs(filtered);
  renderTable(filtered);
  $("hint").textContent = `Mostrando: ${filtered.length} de ${tasks.length}`;
}

function renderKPIs(list) {
  const total = list.length;

  const and = list.filter((t) =>
    String(t.status || "").toLowerCase().includes("andamento")
  ).length;

  const done = list.filter((t) => {
    const s = String(t.status || "").toLowerCase();
    return s.includes("conclu") && !s.includes("atraso");
  }).length;

  // atraso por DATA: prazo < agora e não concluído
  const now = new Date();
  const late = list.filter((t) => {
    const prazo = parseISO(t.prazo);
    const s = String(t.status || "").toLowerCase();
    const isDone = s.includes("conclu");
    return prazo && prazo < now && !isDone;
  }).length;

  $("kTotal").textContent = total;
  $("kAnd").textContent = and;
  $("kDone").textContent = done;
  $("kLate").textContent = late;
}

function renderTable(list) {
  const tb = $("tb");
  tb.innerHTML = "";

  (list || []).forEach((t) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fmtCompetencia(t.competencia)}</td>
      <td>${t.recorrencia || ""}</td>
      <td>${t.tipo || ""}</td>
      <td>${t.atividade || ""}</td>
      <td>${t.responsavelNome || t.responsavelEmail || ""}</td>
      <td>${fmtDateBR(t.prazo)}</td>
      <td>${t.realizado ? fmtDateBR(t.realizado) : ""}</td>
      <td><span class="pill ${pillClass(t.status)}">${t.status || ""}</span></td>
      <td></td>
    `;

    const td = tr.querySelector("td:last-child");
    const row = document.createElement("div");
    row.className = "rowActions";

    const b1 = document.createElement("button");
    b1.className = "sm";
    b1.textContent = "Editar";
    b1.onclick = () => openModalEdit(t.id);

    const b2 = document.createElement("button");
    b2.className = "sm";
    b2.textContent = "Duplicar";
    b2.onclick = async () => {
      const r = await api(`/api/tasks/${t.id}/duplicate`, { method: "POST" });
      if (!r.ok) alert(r.error || "Erro");
      else loadTasks();
    };

    const b3 = document.createElement("button");
    b3.className = "sm danger";
    b3.textContent = "Excluir";
    b3.onclick = async () => {
      if (!confirm("Excluir task?")) return;
      const r = await api(`/api/tasks/${t.id}`, { method: "DELETE" });
      if (!r.ok) alert(r.error || "Erro");
      else loadTasks();
    };

    row.appendChild(b1);
    row.appendChild(b2);
    row.appendChild(b3);
    td.appendChild(row);

    tb.appendChild(tr);
  });
}

/* =========================
   Modal
========================= */
function openModalNew() {
  editingId = null;
  $("mTitle").textContent = "Nova task";
  $("mHint").textContent = "";

  $("mCompetencia").value = "";
  $("mRecorrencia").value = (lookups.RECORRENCIA || [])[0] || "";
  $("mTipo").value = (lookups.TIPO || [])[0] || "";
  $("mStatus").value = (lookups.STATUS || [])[0] || "";

  const found = users.find((u) => u.email === me.email);
  $("mResp").value = found ? found.email : users[0]?.email || "";

  $("mAtividade").value = "";
  $("mPrazo").value = ""; // input date
  $("mRealizado").value = ""; // datetime-local (mantemos ISO no backend)
  $("mObs").value = "";

  // regra: USER não edita prazo
  $("mPrazo").disabled = me.role === "USER";

  $("modal").classList.add("show");
}

function openModalEdit(id) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;

  editingId = id;
  $("mTitle").textContent = "Editar task";
  $("mHint").textContent = "";

  $("mCompetencia").value = t.competencia || "";
  $("mRecorrencia").value = t.recorrencia || "";
  $("mTipo").value = t.tipo || "";
  $("mStatus").value = t.status || "";
  $("mResp").value = t.responsavelEmail || "";

  $("mAtividade").value = t.atividade || "";
  $("mPrazo").value = t.prazo ? new Date(t.prazo).toISOString().slice(0, 10) : "";
  $("mRealizado").value = t.realizado ? isoToInputDT(t.realizado) : "";
  $("mObs").value = t.observacoes || "";

  $("mPrazo").disabled = me.role === "USER";

  $("modal").classList.add("show");
}

function closeModal() {
  $("modal").classList.remove("show");
}

async function saveTask() {
  $("mHint").textContent = "Salvando...";

  const payload = {
    competencia: $("mCompetencia").value || "",
    recorrencia: $("mRecorrencia").value || "",
    tipo: $("mTipo").value || "",
    status: $("mStatus").value || "",
    responsavelEmail: $("mResp").value || "",
    atividade: ($("mAtividade").value || "").trim(),
    prazo: $("mPrazo").value ? new Date($("mPrazo").value).toISOString() : "",
    realizado: $("mRealizado").value ? new Date($("mRealizado").value).toISOString() : "",
    observacoes: ($("mObs").value || "").trim(),
  };

  const res = editingId
    ? await api(`/api/tasks/${editingId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      })
    : await api(`/api/tasks`, { method: "POST", body: JSON.stringify(payload) });

  if (!res.ok) {
    $("mHint").textContent = res.error || "Erro";
    return;
  }

  closeModal();
  loadTasks();
}

async function clearRealizado() {
  if (!editingId) {
    $("mRealizado").value = "";
    return;
  }

  const res = await api(`/api/tasks/${editingId}`, {
    method: "PUT",
    body: JSON.stringify({ realizado: "CLEAR" }),
  });

  if (!res.ok) alert(res.error || "Erro");
  else {
    closeModal();
    loadTasks();
  }
}

document.addEventListener("DOMContentLoaded", bootstrap);