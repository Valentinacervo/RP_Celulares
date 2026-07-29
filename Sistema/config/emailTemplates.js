function templateCodigoRecuperacao(codigo) {
  return `
  <!DOCTYPE html>
  <html lang="pt-br">
  <body style="margin:0; padding:0; background:#F4F5F3; font-family: Arial, Helvetica, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table width="100%" style="max-width:420px; background:#FFFFFF; border:1px solid #E4E7E1; border-radius:6px; overflow:hidden;">

            <!-- CABEÇALHO -->
            <tr>
              <td style="background:#16301F; padding:22px 28px;">
                <span style="color:#FFFFFF; font-size:18px; font-weight:bold;">RP Celulares</span>
              </td>
            </tr>

            <!-- CORPO -->
            <tr>
              <td style="padding:32px 28px 24px;">
                <p style="margin:0 0 8px; font-size:14px; color:#14150F;">
                  Olá,
                </p>
                <p style="margin:0 0 24px; font-size:14px; color:#6B6F68; line-height:1.5;">
                  Recebemos uma solicitação para redefinir a senha da sua conta. Use o código abaixo para continuar:
                </p>

                <!-- CÓDIGO -->
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="background:#F4F5F3; border:1px solid #E4E7E1; border-radius:6px; padding:18px;">
                      <span style="font-size:28px; font-weight:bold; letter-spacing:8px; color:#16301F;">
                        ${codigo}
                      </span>
                    </td>
                  </tr>
                </table>

                <p style="margin:24px 0 0; font-size:13px; color:#6B6F68; line-height:1.5;">
                  Este código expira em <strong>10 minutos</strong>. Se você não solicitou essa recuperação, pode ignorar este e-mail com segurança.
                </p>
              </td>
            </tr>

            <!-- RODAPÉ -->
            <tr>
              <td style="padding:16px 28px; border-top:1px solid #E4E7E1;">
                <p style="margin:0; font-size:11px; color:#9a9d97;">
                  Este é um e-mail automático, por favor não responda.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
}

module.exports = { templateCodigoRecuperacao };