let me = null;
let lookups = {};
let selected = null;

const $ = (id) => document.getElementById(id);

async function bootstrap() {
  const meRes = await api("/api/me");
  if (!meRes.ok) return logout();
  me = meRes.user;
  if (me.role !== "ADMIN") return logout();

  $("meLine").textContent = `${me.nome || me.email} • ADMIN`;
  $("btnLogout").onclick = (e) => { e.preventDefault(); logout(); };

  $("cat").onchange = () => { selected = null; render(); };
  $("add").onclick = addItem;
  $("rename").onclick = renameItem;

  await loadLookups();
  render();
}

async function loadLookups() {
  const res = await api("/api/lookups");
  if (!res.ok) { $("hint").textContent = res.error || "Erro"; return; }
  lookups = res.lookups || {};
}

function render() {
  const cat = $("cat").value;
  const items = lookups[cat] || [];

  const list = $("list");
  list.innerHTML = "";

  items.forEach(v => {
    const span = document.createElement("span");
    span.className = "pill";
    span.textContent = v;
    span.style.cursor = "pointer";
    span.onclick = () => {
      selected = v;
      $("val").value = v;
      $("hint").textContent = `Selecionado: ${v}`;
    };
    list.appendChild(span);
  });

  if (!selected) $("hint").textContent = `Itens: ${items.length}`;
}

async function addItem() {
  const category = $("cat").value;
  const value = ($("val").value || "").trim();
  const order = $("ord").value ? Number($("ord").value) : 9999;
  if (!value) return alert("Informe o valor.");

  const res = await api("/api/lookups", { method:"POST", body: JSON.stringify({ category, value, order }) });
  if (!res.ok) return alert(res.error || "Erro");

  lookups = res.lookups || {};
  $("val").value = ""; $("ord").value = "";
  selected = null;
  render();
}

async function renameItem() {
  const category = $("cat").value;
  const newValue = ($("val").value || "").trim();
  if (!selected) return alert("Clique num item para selecionar.");
  if (!newValue) return alert("Informe o novo valor.");
  if (newValue === selected) return alert("Novo valor igual ao antigo.");

  const res = await api("/api/lookups/rename", {
    method:"PUT",
    body: JSON.stringify({ category, oldValue: selected, newValue })
  });
  if (!res.ok) return alert(res.error || "Erro");

  lookups = res.lookups || {};
  selected = null;
  $("val").value = "";
  render();
}

document.addEventListener("DOMContentLoaded", bootstrap);