const $ = (id) => document.getElementById(id);

function showResetMode(on) {
  $("resetBox").style.display = on ? "block" : "none";
  $("btnReset").style.display = on ? "block" : "none";
}

$("toggleReset").onclick = (e) => {
  e.preventDefault();
  const on = $("resetBox").style.display === "none";
  showResetMode(on);
  $("hint").textContent = on ? "Modo reset habilitado." : "";
};

$("btnLogin").onclick = async () => {
  const hint = $("hint");
  hint.textContent = "Autenticando...";

  const email = $("email").value.trim();
  const password = $("password").value.trim();

  const res = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    if (res.error === "RESET_REQUIRED") {
      showResetMode(true);
      hint.textContent = res.firstAccess
        ? "Primeiro acesso: defina sua senha com o código do Admin."
        : "Reset necessário: defina sua senha com o código do Admin.";
      return;
    }

    hint.textContent = res.error || "Erro";
    return;
  }

  window.location.href = "/calendar";
};

$("btnReset").onclick = async () => {
  const hint = $("hint");
  hint.textContent = "Definindo senha...";

  const email = $("email").value.trim();
  const code = $("resetCode").value.trim();
  const p1 = $("newPass").value.trim();
  const p2 = $("newPass2").value.trim();

  if (!email) { hint.textContent = "Email é obrigatório."; return; }
  if (!code) { hint.textContent = "Código é obrigatório."; return; }
  if (!p1 || p1.length < 6) { hint.textContent = "Senha mínima: 6 caracteres."; return; }
  if (p1 !== p2) { hint.textContent = "As senhas não conferem."; return; }

  const res = await api("/api/auth/reset", {
    method: "POST",
    body: JSON.stringify({ email, code, newPassword: p1 }),
  });

  if (!res.ok) {
    hint.textContent = res.error || "Erro";
    return;
  }

  window.location.href = "/calendar";
};