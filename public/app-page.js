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

/* date helpers */
function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23,59,59,999); return x; }
function parseISO(iso) { if(!iso) return null; const d = new Date(iso); return isNaN(d.getTime()) ? null : d; }

function applyFilters(list) {
  const status = ($("fStatus").value || "").trim();
  const resp = ($("fResp")?.value || "").trim();
  const fromStr = $("fFrom").value;
  const toStr = $("fTo").value;

  const from = fromStr ? startOfDay(new Date(fromStr)) : null;
  const to = toStr ? endOfDay(new Date(toStr)) : null;

  return (list || []).filter((t) => {
    if (status && String(t.status || "") !== status) return false;
    if (resp && String(t.responsavelEmail || "").toLowerCase() !== resp.toLowerCase()) return false;

    const p = parseISO(t.prazo);
    if (from && (!p || p < from)) return false;
    if (to && (!p || p > to)) return false;

    return true;
  });
}

function isDoneTask(t) {
  const s = String(t.status || "").toLowerCase();
  return s.includes("conclu");
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
  } else {
    setCompetenciaDefaultToday();
  }
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
  renderKPIs(filtered);
  renderTable(filtered);
  $("hint").textContent = `Mostrando: ${filtered.length} de ${tasks.length}`;
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

  if (me.role === "USER") {
    const btnNew = document.getElementById("btnNew");
    if (btnNew) btnNew.style.display = "none";
  }

  const [lres, ures] = await Promise.all([api("/api/lookups"), api("/api/users")]);
  lookups = (lres && lres.ok && lres.lookups) ? lres.lookups : {};
  users = (ures && ures.ok && ures.users) ? ures.users : [];

  // filtros default = hoje
  const today = new Date();
  $("fFrom").value = today.toISOString().slice(0, 10);
  $("fTo").value = today.toISOString().slice(0, 10);

  fillSelect($("fStatus"), lookups.STATUS || [], { empty: "Todos" });

  // filtro responsável (LEADER/ADMIN)
  if ($("fResp")) {
    if (me.role === "USER") {
      $("fResp").style.display = "none";
    } else {
      fillUsersSelect($("fResp"), users, { empty: "Todos responsáveis" });
    }
  }

  // modal selects
  setupCompetenciaSelects();
  fillSelect($("mRecorrencia"), lookups.RECORRENCIA || []);
  fillSelect($("mTipo"), lookups.TIPO || []);
  fillSelect($("mStatus"), lookups.STATUS || []);
  fillUsersSelect($("mResp"), users);

  // eventos
  $("btnNew").onclick = () => openModalNew();
  $("btnRefresh").onclick = () => loadTasks();
  $("btnFilter").onclick = () => renderFromLocal();

  $("mClose").onclick = () => closeModal();
  $("mCancel").onclick = () => closeModal();
  $("mSave").onclick = () => saveTask();
  $("mClearReal").onclick = () => clearRealizado();

  await loadTasks();
}

/* load + render */
async function loadTasks() {
  $("hint").textContent = "Carregando...";
  const res = await api("/api/tasks");
  if (!res.ok) { $("hint").textContent = res.error || "Erro"; return; }

  tasks = res.tasks || [];
  renderFromLocal();
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

  const now = new Date();
  const late = list.filter((t) => {
    const prazo = parseISO(t.prazo);
    return prazo && prazo < now && !isDoneTask(t);
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
      <td>${fmtCompetencia(t.competenciaYm || t.competencia)}</td>
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

    // concluir / reabrir
    const bDone = document.createElement("button");
    bDone.className = "sm";
    bDone.title = isDoneTask(t) ? "Reabrir" : "Concluir";
    bDone.textContent = isDoneTask(t) ? "↩" : "✅";
    bDone.onclick = async () => toggleDone(t);
    row.appendChild(bDone);

    if (me.role === "USER") {
      const bView = document.createElement("button");
      bView.className = "sm";
      bView.title = "Visualizar";
      bView.textContent = "👁";
      bView.onclick = () => openModalView(t.id);
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
      const r = await api(`/api/tasks/${t.id}/duplicate`, { method: "POST" });
      if (!r.ok) return alert(r.error || "Erro");
      if (r.task) tasks.unshift(r.task);
      renderFromLocal();
    };
    row.appendChild(bDup);

    const bDel = document.createElement("button");
    bDel.className = "sm danger";
    bDel.title = "Excluir";
    bDel.textContent = "🗑";
    bDel.onclick = async () => {
      if (!confirm("Excluir task?")) return;
      const r = await api(`/api/tasks/${t.id}`, { method: "DELETE" });
      if (!r.ok) return alert(r.error || "Erro");
      removeLocalTask(t.id);
      renderFromLocal();
    };
    row.appendChild(bDel);

    td.appendChild(row);
    tb.appendChild(tr);
  });
}

async function toggleDone(t) {
  const done = isDoneTask(t);
  const patch = done
    ? { status: "Em Andamento", realizado: "CLEAR" } // limpa realizado
    : { status: "Concluído", realizado: new Date().toISOString() };

  // otimista
  const before = { ...t };
  if (done) {
    t.status = "Em Andamento";
    t.realizado = "";
  } else {
    t.status = "Concluído";
    t.realizado = patch.realizado;
  }
  renderFromLocal();

  const r = await api(`/api/tasks/${t.id}`, { method: "PUT", body: JSON.stringify(patch) });
  if (!r.ok) {
    // rollback
    upsertLocalTask(before);
    renderFromLocal();
    return alert(r.error || "Erro");
  }
  if (r.task) upsertLocalTask(r.task);
  renderFromLocal();
}

/* modal */
function openModalNew() {
  if (me.role === "USER") return;

  editingId = null;
  $("mTitle").textContent = "Nova task";
  $("mHint").textContent = "";

  setCompetenciaDefaultToday();

  $("mRecorrencia").value = (lookups.RECORRENCIA || [])[0] || "";
  $("mTipo").value = (lookups.TIPO || [])[0] || "";
  $("mStatus").value = (lookups.STATUS || [])[0] || "";

  $("mResp").value = me.email;

  $("mAtividade").value = "";
  $("mPrazo").value = "";
  $("mRealizado").value = "";
  $("mObs").value = "";

  setModalEditable(true);
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
  $("mPrazo").value = t.prazo ? new Date(t.prazo).toISOString().slice(0, 10) : "";
  $("mRealizado").value = t.realizado ? isoToInputDT(t.realizado) : "";
  $("mObs").value = t.observacoes || "";

  setModalEditable(true);
  $("modal").classList.add("show");
}

function openModalView(id) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;

  editingId = null;
  $("mTitle").textContent = "Visualizar task";
  $("mHint").textContent = "";

  setCompetenciaFromTask(t);

  $("mRecorrencia").value = t.recorrencia || "";
  $("mTipo").value = t.tipo || "";
  $("mStatus").value = t.status || "";
  $("mResp").value = t.responsavelEmail || "";

  $("mAtividade").value = t.atividade || "";
  $("mPrazo").value = t.prazo ? new Date(t.prazo).toISOString().slice(0, 10) : "";
  $("mRealizado").value = t.realizado ? isoToInputDT(t.realizado) : "";
  $("mObs").value = t.observacoes || "";

  setModalEditable(false);
  $("modal").classList.add("show");
}

function setModalEditable(on) {
  const ids = ["mCompMes","mCompAno","mRecorrencia","mTipo","mStatus","mResp","mAtividade","mPrazo","mRealizado","mObs"];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !on;
  });
  const save = document.getElementById("mSave");
  const clear = document.getElementById("mClearReal");
  if (save) save.style.display = on ? "inline-block" : "none";
  if (clear) clear.style.display = on ? "inline-block" : "none";
}

function closeModal() {
  $("modal").classList.remove("show");
}

async function saveTask() {
  if (me.role === "USER") return;

  $("mHint").textContent = "Salvando...";
  const competenciaYm = `${$("mCompAno").value}-${$("mCompMes").value}`;

  const payload = {
    competenciaYm,
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
    ? await api(`/api/tasks/${editingId}`, { method: "PUT", body: JSON.stringify(payload) })
    : await api(`/api/tasks`, { method: "POST", body: JSON.stringify(payload) });

  if (!res.ok) { $("mHint").textContent = res.error || "Erro"; return; }

  closeModal();
  if (res.task) upsertLocalTask(res.task);
  else await loadTasks();
  renderFromLocal();
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