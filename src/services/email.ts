/**
 * Serviço de e-mail via Resend (plano gratuito: 3.000/mês, 100/dia).
 * Template em formato de card para código de redefinição de senha.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "Task Manager <onboarding@resend.dev>";

export interface SendResetCodeOptions {
  to: string;
  userName: string;
  code: string;
  expiresAt: string;
  tenantName?: string;
}

/**
 * Gera o HTML do e-mail em formato de card (compatível com clientes de e-mail).
 */
function buildResetCodeCardHtml(options: SendResetCodeOptions): string {
  const { userName, code, expiresAt, tenantName } = options;
  const expDate = new Date(expiresAt);
  const expFormatted = expDate.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redefinição de senha</title>
</head>
<body style="margin:0; padding:0; background-color:#f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9; padding: 24px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 420px; background-color:#ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.07); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 24px 24px 20px; text-align: center;">
              <h1 style="margin:0; color:#f8fafc; font-size: 20px; font-weight: 600;">Task Manager</h1>
              <p style="margin: 6px 0 0; color:#94a3b8; font-size: 13px;">Redefinição de senha</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 24px;">
              <p style="margin:0 0 16px; color:#334155; font-size: 15px; line-height: 1.5;">Olá, <strong>${escapeHtml(userName)}</strong>.</p>
              <p style="margin:0 0 20px; color:#64748b; font-size: 14px; line-height: 1.5;">Use o código abaixo para definir uma nova senha. Ele é válido por 30 minutos.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 20px;">
                <tr>
                  <td align="center" style="background-color:#f1f5f9; border-radius: 8px; padding: 16px 24px; border: 2px dashed #cbd5e1;">
                    <span style="font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #0f172a;">${escapeHtml(code)}</span>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px; color:#94a3b8; font-size: 12px;">Válido até: <strong>${escapeHtml(expFormatted)}</strong></p>
              ${tenantName ? `<p style="margin:0; color:#94a3b8; font-size: 12px;">Empresa: ${escapeHtml(tenantName)}</p>` : ""}
              <p style="margin: 20px 0 0; color:#64748b; font-size: 13px; line-height: 1.5;">Se você não solicitou esta redefinição, ignore este e-mail. Sua senha atual permanece válida.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 24px; background-color:#f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin:0; color:#94a3b8; font-size: 11px;">Task Manager · Multi-tenant</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return String(text).replace(/[&<>"']/g, (c) => map[c] ?? c);
}

/**
 * Envia o código de redefinição por e-mail usando Resend.
 * Retorna { sent: true } em sucesso ou { sent: false, error: string } em falha.
 */
export async function sendResetCodeEmail(options: SendResetCodeOptions): Promise<{ sent: boolean; error?: string }> {
  if (!RESEND_API_KEY || !RESEND_API_KEY.startsWith("re_")) {
    return { sent: false, error: "RESEND_API_KEY não configurada." };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(RESEND_API_KEY);

    const html = buildResetCodeCardHtml(options);
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: options.to,
      subject: "Seu código para redefinir a senha — Task Manager",
      html,
    });

    if (error) {
      return { sent: false, error: error.message || "Falha ao enviar e-mail." };
    }
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao enviar e-mail.";
    return { sent: false, error: message };
  }
}
