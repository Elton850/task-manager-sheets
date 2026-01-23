let me = null;
let users = [];
let editing = null;          // email do usuário em edição (ou null)
let editingPrevActive = null;

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

function setHint(text) {
  $("hint").textContent = text || "";
}

function setModalHint(text) {
  $("mHint").textContent = text || "";
}

function setSaveHint(text) {
  $("mSaveHint").textContent = text || "";
}

/* ===== Reset code UI ===== */
function hideResetCodeBox() {
  const box = $("resetCodeBox");
  if (box) box.style.display = "none";
  const input = $("resetCodeInput");
  if (input) input.value = "";
  const hint = $("resetCodeHint");
  if (hint) hint.textContent = "";
}

function showResetCodeBox(code, expiresAt) {
  const box = $("resetCodeBox");
  const input = $("resetCodeInput");
  const hint = $("resetCodeHint");
  if (!box || !input || !hint) return;

  input.value = code || "";
  box.style.display = "block";

  const exp = expiresAt ? new Date(expiresAt).toLocaleString("pt-BR") : "—";
  hint.textContent = `Expira em: ${exp} • Clique no botão para copiar`;
}

async function copyResetCode() {
  const input = $("resetCodeInput");
  const hint = $("resetCodeHint");
  if (!input) return;

  const code = String(input.value || "").trim();
  if (!code) return;

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(code);
    } else {
      input.focus();
      input.select();
      document.execCommand("copy");
    }
    if (hint) hint.textContent = "Copiado ✔";
    setTimeout(() => {
      if (hint && hint.textContent === "Copiado ✔") {
        hint.textContent = "Copiado. Envie ao usuário.";
      }
    }, 1200);
  } catch {
    // fallback: pelo menos seleciona
    input.focus();
    input.select();
    if (hint) hint.textContent = "Selecione e copie (Ctrl+C).";
  }
}

async function bootstrap() {
  const meRes = await api("/api/me");
  if (!meRes || !meRes.ok) return logout();
  me = meRes.user;
  if (me.role !== "ADMIN") return logout();

  $("meLine").textContent = `${me.nome || me.email} • ${me.role} • Área: ${me.area || "-"}`;
  $("btnLogout").onclick = (e) => { e.preventDefault(); logout(); };

  // mostra links admin no menu
  const a = document.getElementById("adminLink");
  if (a) a.style.display = "block";
  const u = document.getElementById("usersLink");
  if (u) u.style.display = "block";

  $("btnNew").onclick = () => edit(null);
  $("btnRefresh").onclick = () => load();

  $("mClose").onclick = () => openModal(false);
  $("mCancel").onclick = () => openModal(false);
  $("mSave").onclick = save;

  const btnCopy = $("btnCopyCode");
  if (btnCopy) btnCopy.onclick = (e) => { e.preventDefault(); copyResetCode(); };

  // load de lookups (AREA)
  setHint("Carregando...");
  const lr = await api("/api/lookups");
  const areas = (lr && lr.ok && lr.lookups && lr.lookups.AREA) ? lr.lookups.AREA : [];
  fillSelect($("mArea"), areas, { empty: "—" });

  await load();
}

async function load() {
  setHint("Carregando...");
  const res = await api("/api/admin/users");
  if (!res || !res.ok) { setHint(res?.error || "Erro"); return; }

  users = res.users || [];
  render();
  setHint(`Usuários: ${users.length}`);
}

function render() {
  const tb = $("tb");
  tb.innerHTML = "";

  users.forEach((u) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td><span class="cellText">${u.email}</span></td>
      <td><span class="cellText">${u.nome || ""}</span></td>
      <td>${u.role}</td>
      <td><span class="cellText">${u.area || ""}</span></td>
      <td>${u.active ? "Sim" : "Não"}</td>
      <td>${u.canDelete ? "Sim" : "Não"}</td>
      <td class="col-actions"></td>
    `;

    const td = tr.querySelector("td:last-child");
    const wrap = document.createElement("div");
    wrap.className = "rowActions";

    const bEdit = document.createElement("button");
    bEdit.className = "sm";
    bEdit.textContent = "Editar";
    bEdit.onclick = () => edit(u);

    const bAct = document.createElement("button");
    bAct.className = "sm danger";
    bAct.textContent = u.active ? "Inativar" : "Ativar";
    bAct.onclick = async () => {
      if (u.active && !confirm(`Inativar ${u.email}?`)) return;
      if (!u.active && !confirm(`Ativar ${u.email}? (vai exigir primeiro acesso/reset)`)) return;

      setHint("Salvando...");
      const r = await api(`/api/admin/users/${encodeURIComponent(u.email)}/active`, {
        method: "POST",
        body: JSON.stringify({ active: !u.active }),
      });

      if (!r || !r.ok) {
        setHint(r?.error || "Erro");
        return alert(r?.error || "Erro");
      }

      // se ativou agora, gera código automaticamente (silencioso, mas copia e mostra no modal se estiver aberto)
      if (!u.active) {
        await generateResetCode(u.email, true);
      }

      await load();
    };

    wrap.appendChild(bEdit);
    wrap.appendChild(bAct);
    td.appendChild(wrap);

    tb.appendChild(tr);
  });
}

function edit(u) {
  editing = u ? u.email : null;
  editingPrevActive = u ? !!u.active : null;

  $("mTitle").textContent = u ? "Editar usuário" : "Novo usuário";
  setModalHint(u ? "Edite dados do usuário." : "Crie um novo usuário (sem senha).");
  setSaveHint("");

  $("mEmail").value = u ? u.email : "";
  $("mEmail").disabled = !!u;

  $("mNome").value = u ? (u.nome || "") : "";
  $("mRole").value = u ? u.role : "USER";

  $("mArea").value = u ? (u.area || "") : ($("mArea").options[0]?.value || "");
  $("mActive").value = u ? String(!!u.active) : "true";
  $("mCanDelete").value = u ? String(!!u.canDelete) : "false";

  // default: novo usuário sempre gera; edição só se marcar
  $("mForceReset").checked = !u;

  hideResetCodeBox();
  openModal(true);
}

async function save() {
  setSaveHint("Salvando...");

  const email = $("mEmail").value.trim().toLowerCase();
  if (!email) { setSaveHint("Email é obrigatório."); return; }

  const payload = {
    email,
    nome: $("mNome").value.trim(),
    role: $("mRole").value,
    area: $("mArea").value || "",
    active: boolVal($("mActive").value),
    canDelete: boolVal($("mCanDelete").value),
  };

  const isNew = !editing;
  const forceReset = !!$("mForceReset").checked;

  const res = editing
    ? await api(`/api/admin/users/${encodeURIComponent(editing)}`, { method: "PUT", body: JSON.stringify(payload) })
    : await api(`/api/admin/users`, { method: "POST", body: JSON.stringify(payload) });

  if (!res || !res.ok) {
    setSaveHint(res?.error || "Erro");
    return;
  }

  // regra: se novo OU reativou (false->true) OU marcou checkbox => gera código
  const becameActiveNow = (editingPrevActive === false && payload.active === true);

  if (isNew || becameActiveNow || forceReset) {
    const out = await generateResetCode(email, false);
    if (out?.code) {
      // mostra no modal e deixa copiar fácil (mantém modal aberto)
      showResetCodeBox(out.code, out.expiresAt);
      setSaveHint("Salvo. Código gerado — copie e envie ao usuário.");
      // não fecha modal automaticamente quando gera código
      await load();
      return;
    }
  }

  openModal(false);
  await load();
}

async function generateResetCode(email, silent) {
  try {
    if (!silent) setHint("Gerando código de primeiro acesso...");

    const r = await api(`/api/admin/users/${encodeURIComponent(email)}/reset-code`, {
      method: "POST",
    });

    if (!r || !r.ok) {
      if (!silent) {
        setHint(r?.error || "Erro ao gerar código");
        alert(r?.error || "Erro ao gerar código");
      }
      return null;
    }

    // tenta copiar automaticamente
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(String(r.code || "")); } catch {}
    }

    // se o modal estiver aberto, mostra dentro dele (mesmo no modo silencioso)
    const modalOpen = $("modal")?.classList.contains("show");
    if (modalOpen) showResetCodeBox(r.code, r.expiresAt);

    if (!silent) {
      const exp = r.expiresAt ? new Date(r.expiresAt).toLocaleString("pt-BR") : "—";
      setHint(`Código gerado: ${r.code} (expira em ${exp})`);
    }

    return { code: r.code, expiresAt: r.expiresAt };
  } catch (e) {
    if (!silent) alert("Falha ao gerar código.");
    return null;
  }
}

document.addEventListener("DOMContentLoaded", bootstrap);