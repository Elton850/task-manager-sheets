let me = null;
let users = [];
let editing = null;

const $ = (id) => document.getElementById(id);

function openModal(v) { $("modal").classList.toggle("show", !!v); }
function boolVal(v) { return String(v) === "true"; }

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

async function bootstrap() {
  const meRes = await api("/api/me");
  if (!meRes.ok) return logout();
  me = meRes.user;
  if (me.role !== "ADMIN") return logout();

  $("meLine").textContent = `${me.nome || me.email} • ADMIN`;
  $("btnLogout").onclick = (e) => { e.preventDefault(); logout(); };

  $("btnNew").onclick = () => edit(null);
  $("mClose").onclick = () => openModal(false);
  $("mCancel").onclick = () => openModal(false);
  $("mSave").onclick = save;

  // carrega lookups para AREA
  const lr = await api("/api/lookups");
  const areas = (lr.ok && lr.lookups && lr.lookups.AREA) ? lr.lookups.AREA : [];
  fillSelect($("mArea"), areas, { empty: "—" });

  await load();
}

async function load() {
  $("hint").textContent = "Carregando...";
  const res = await api("/api/admin/users");
  if (!res.ok) { $("hint").textContent = res.error || "Erro"; return; }
  users = res.users || [];
  render();
  $("hint").textContent = `Usuários: ${users.length}`;
}

function render() {
  const tb = $("tb");
  tb.innerHTML = "";

  users.forEach((u) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.email}</td>
      <td>${u.nome || ""}</td>
      <td>${u.role}</td>
      <td>${u.area || ""}</td>
      <td>${u.active ? "Sim" : "Não"}</td>
      <td>${u.canDelete ? "Sim" : "Não"}</td>
      <td></td>
    `;

    const td = tr.querySelector("td:last-child");
    const wrap = document.createElement("div");
    wrap.className = "rowActions";

    const b1 = document.createElement("button");
    b1.className = "sm";
    b1.textContent = "Editar";
    b1.onclick = () => edit(u);

    const b2 = document.createElement("button");
    b2.className = "sm danger";
    b2.textContent = u.active ? "Inativar" : "Ativar";
    b2.onclick = async () => {
      const r = await api(`/api/admin/users/${encodeURIComponent(u.email)}/active`, {
        method: "POST",
        body: JSON.stringify({ active: !u.active }),
      });
      if (!r.ok) alert(r.error || "Erro");
      else load();
    };

    wrap.appendChild(b1);
    wrap.appendChild(b2);
    td.appendChild(wrap);
    tb.appendChild(tr);
  });
}

function edit(u) {
  editing = u ? u.email : null;
  $("mTitle").textContent = u ? "Editar usuário" : "Novo usuário";
  $("mHint").textContent = "";

  $("mEmail").value = u ? u.email : "";
  $("mEmail").disabled = !!u;

  $("mNome").value = u ? (u.nome || "") : "";
  $("mRole").value = u ? u.role : "USER";

  // se não existir área no lookup, deixa em branco
  $("mArea").value = u ? (u.area || "") : ($("mArea").options[0]?.value || "");

  $("mActive").value = u ? String(!!u.active) : "true";
  $("mCanDelete").value = u ? String(!!u.canDelete) : "false";
  $("mPass").value = "";

  openModal(true);
}

async function save() {
  $("mHint").textContent = "Salvando...";

  const payload = {
    email: $("mEmail").value.trim().toLowerCase(),
    nome: $("mNome").value.trim(),
    role: $("mRole").value,
    area: $("mArea").value || "",
    active: boolVal($("mActive").value),
    canDelete: boolVal($("mCanDelete").value),
  };

  const password = $("mPass").value.trim();
  if (!editing && !password) { $("mHint").textContent = "Senha é obrigatória para novo usuário."; return; }
  if (password) payload.password = password;

  const res = editing
    ? await api(`/api/admin/users/${encodeURIComponent(editing)}`, { method: "PUT", body: JSON.stringify(payload) })
    : await api(`/api/admin/users`, { method: "POST", body: JSON.stringify(payload) });

  if (!res.ok) { $("mHint").textContent = res.error || "Erro"; return; }
  openModal(false);
  load();
}

document.addEventListener("DOMContentLoaded", bootstrap);