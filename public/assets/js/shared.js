function getToken() {
  return sessionStorage.getItem("token") || "";
}

function readCookie(name) {
  const parts = document.cookie.split(";").map(s => s.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) return decodeURIComponent(p.slice(name.length + 1));
  }
  return "";
}

async function api(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();

  const headers = { ...(options.headers || {}) };

  if (!headers["Content-Type"] && method !== "GET" && method !== "HEAD") {
    headers["Content-Type"] = "application/json";
  }

  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const csrf = readCookie("qco_csrf");
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }

  const res = await fetch(path, {
    ...options,
    method,
    headers,
    credentials: "include",
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { ok: false, error: "Resposta inválida do servidor" }; }

  if (res.status === 401) {
    window.location.href = "/";
    return { ok: false, error: "UNAUTHORIZED" };
  }

  return json;
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch {}
  sessionStorage.removeItem("token"); // pode manter, não atrapalha
  window.location.href = "/";
}

function pillClass(status) {
  const s = (status || "").toLowerCase();
  if (s.includes("atraso")) return "dead";
  if (s.includes("andamento")) return "warn";
  if (s.includes("conclu")) return "ok";
  return "";
}

function fmtDateBR(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR").format(d);
}

function isoToInputDT(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ========= Competência robusta =========
   Aceita: YYYY-MM, YYYY-M, MM/YYYY, YYYY/MM, YYYY-MM-DD, e retorna MM/YYYY
*/
function fmtCompetencia(input) {
  const s = String(input || "").trim();
  if (!s) return "";

  // YYYY-MM-DD (pega só ano/mes)
  let m = s.match(/^(\d{4})-(\d{1,2})-\d{1,2}/);
  if (m) {
    const yy = m[1];
    const mm = String(Number(m[2])).padStart(2, "0");
    return `${mm}/${yy}`;
  }

  // YYYY-MM ou YYYY-M
  m = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m) {
    const yy = m[1];
    const mm = String(Number(m[2])).padStart(2, "0");
    return `${mm}/${yy}`;
  }

  // YYYY/MM ou YYYY/M
  m = s.match(/^(\d{4})\/(\d{1,2})$/);
  if (m) {
    const yy = m[1];
    const mm = String(Number(m[2])).padStart(2, "0");
    return `${mm}/${yy}`;
  }

  // MM/YYYY ou M/YYYY
  m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = String(Number(m[1])).padStart(2, "0");
    const yy = m[2];
    return `${mm}/${yy}`;
  }

  // tenta converter "Fevereiro de 2026" -> 02/2026
  // (funciona mesmo se vier "fevereiro 2026")
  const meses = {
    janeiro: "01", fevereiro: "02", marco: "03", março: "03", abril: "04", maio: "05", junho: "06",
    julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
  };
  const lower = s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // remove acentos

  const y = lower.match(/(\d{4})/);
  if (y) {
    for (const nome in meses) {
      if (lower.includes(nome)) return `${meses[nome]}/${y[1]}`;
    }
  }

  // se não casar, devolve como está (pelo menos não quebra)
  return s;
}

/* ===== Helpers de SELECT (usados no app-page.js e calendar-page.js) ===== */
/* ===== Helpers de SELECT (mesmo padrão do app-page.js) ===== */

function fillSelect(selectEl, items, opts = {}) {
  if (!selectEl) return;

  const {
    empty = null,
    selected = null,
    disabled = false
  } = opts;

  selectEl.innerHTML = "";
  selectEl.disabled = !!disabled;

  if (empty !== null) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = empty;
    selectEl.appendChild(o);
  }

  (items || []).forEach((item) => {
    const value = typeof item === "string" ? item : item?.value;
    const label = typeof item === "string" ? item : item?.label ?? item?.value;

    if (!value) return;

    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    selectEl.appendChild(o);
  });

  if (selected !== null && selected !== undefined) {
    selectEl.value = selected;
  }
}

function fillUsersSelect(selectEl, users, opts = {}) {
  if (!selectEl) return;

  const {
    empty = null,
    selected = null,
    disabled = false
  } = opts;

  selectEl.innerHTML = "";
  selectEl.disabled = !!disabled;

  if (empty !== null) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = empty;
    selectEl.appendChild(o);
  }

  (users || []).forEach((u) => {
    if (!u || !u.email) return;

    const o = document.createElement("option");
    o.value = u.email;

    // mesmo label do app-page.js
    o.textContent = u.nome
      ? `${u.nome}`
      : u.email;

    selectEl.appendChild(o);
  });

  if (selected !== null && selected !== undefined) {
    selectEl.value = selected;
  }
}