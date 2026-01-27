let me = null;
let lookups = {};
let currentRule = { area: "", allowedRecorrencias: [], updatedAt: "", updatedBy: "" };

const $ = (id) => document.getElementById(id);

function setHint(msg) {
  const h = $("hint");
  if (h) h.textContent = msg || "";
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

function formatDateBR(v) {
  if (!v) return "-";

  // se vier como Date (ou string de Date), tenta converter
  const d = (v instanceof Date) ? v : new Date(v);

  // fallback se não conseguir parsear
  if (isNaN(d.getTime())) return String(v);

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");

  return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}`;
}

function renderRecList() {
  const all = (lookups.RECORRENCIA || []).slice();
  const allowed = new Set((currentRule.allowedRecorrencias || []).map(x => String(x).trim()));

  const box = $("recList");
  box.innerHTML = "";

  all.forEach((name) => {
    const label = document.createElement("label");
    label.className = "recItem";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = name;
    cb.checked = allowed.has(String(name).trim());

    const span = document.createElement("span");
    span.textContent = name;

    label.appendChild(cb);
    label.appendChild(span);
    box.appendChild(label);
  });

  $("count").textContent = String(currentRule.allowedRecorrencias?.length || 0);
  $("lastAt").textContent = formatDateBR(currentRule.updatedAt);
  $("lastBy").textContent = currentRule.updatedBy ? String(currentRule.updatedBy) : "-";

  $("recHint").textContent = all.length
    ? `Recorrências disponíveis: ${all.length}`
    : "Nenhuma recorrência cadastrada em LOOKUPS.";
}

function getCheckedRecorrencias() {
  const els = Array.from(document.querySelectorAll('#recList input[type="checkbox"]'));
  return els.filter(x => x.checked).map(x => x.value);
}

async function loadLookups() {
  const res = await api("/api/lookups");
  if (!res.ok) throw new Error(res.error || "Erro ao carregar lookups");
  lookups = res.lookups || {};
}

async function loadRule(area) {
  setHint("Carregando rule...");
  const res = await api(`/api/rules/by-area?area=${encodeURIComponent(area)}`);
  if (!res.ok) throw new Error(res.error || "Erro ao carregar rule");

  currentRule = res.rule || { area, allowedRecorrencias: [], updatedAt: "", updatedBy: "" };
  renderRecList();
  setHint("");
}

async function saveRule() {
  const area = $("area").value;
  if (!area) return alert("Selecione a área.");

  const allowedRecorrencias = getCheckedRecorrencias();

  // Se não marcar nada, a regra fica vazia (e USER dessa área não cria task)
  setHint("Salvando...");
  const res = await api("/api/rules", {
    method: "PUT",
    body: JSON.stringify({ area, allowedRecorrencias })
  });

  if (!res.ok) {
    setHint(res.error || "Erro ao salvar");
    return;
  }

  // após salvar, recarrega do backend para pegar updatedAt/By
  await loadRule(area);
  setHint("Salvo.");
  setTimeout(() => setHint(""), 1200);
}

async function bootstrap() {
  const meRes = await api("/api/me");
  if (!meRes.ok) return logout();
  me = meRes.user;

  // só ADMIN/LEADER
  if (me.role !== "ADMIN" && me.role !== "LEADER") return logout();

  $("meLine").textContent = `${me.nome || me.email} • ${me.role} • Área: ${me.area || "-"}`;
  $("btnLogout").onclick = (e) => { e.preventDefault(); logout(); };

  // mostra links
  const adminLink = $("adminLink");
  const usersLink = $("usersLink");
  const rulesLink = $("rulesLink");
  if (rulesLink) rulesLink.style.display = "block";
  if (me.role === "ADMIN") {
    if (adminLink) adminLink.style.display = "block";
    if (usersLink) usersLink.style.display = "block";
  }

  await loadLookups();

  // Área:
  // - ADMIN: escolhe qualquer área do LOOKUPS
  // - LEADER: fixo na área dele
  const areas = lookups.AREA || [];
  if (me.role === "ADMIN") {
    fillSelect($("area"), areas, { empty: "Selecione..." });
    $("area").disabled = false;
    $("areaHint").textContent = "ADMIN: pode configurar qualquer área.";
  } else {
    fillSelect($("area"), [me.area].filter(Boolean));
    $("area").disabled = true;
    $("areaHint").textContent = "LEADER: só pode configurar a própria área.";
  }

  $("area").onchange = async () => {
    const area = $("area").value;
    if (!area) return;
    await loadRule(area);
  };

  $("btnSave").onclick = saveRule;
  $("btnReload").onclick = async () => {
    const area = $("area").value;
    if (!area) return alert("Selecione a área.");
    await loadRule(area);
  };

  // carrega inicial
  const initialArea = (me.role === "LEADER") ? String(me.area || "") : "";
  if (initialArea) {
    $("area").value = initialArea;
    await loadRule(initialArea);
  } else {
    renderRecList();
    setHint("Selecione uma área para carregar a regra.");
  }
}

document.addEventListener("DOMContentLoaded", bootstrap);