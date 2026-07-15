import nodemailer from 'nodemailer';

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const createTransporter = () => {
  const smtpHost = process.env.SMTP_HOST || 'mailpit';
  const smtpPort = parseInt(process.env.SMTP_PORT || '1025');
  const smtpSecure = process.env.SMTP_SECURE === 'true';
  const smtpUser = process.env.SMTP_USER || '';
  const smtpPass = process.env.SMTP_PASS || '';

  const auth = smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined;

  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    ignoreTLS: !smtpSecure && !smtpUser,
    auth,
  });
};

const baseHtml = (body: string): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0f;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
          <tr>
            <td style="padding-bottom:32px;text-align:center;">
              <span style="font-size:28px;font-weight:800;color:#10b981;letter-spacing:-0.5px;">CHDS</span>
              <span style="font-size:28px;font-weight:300;color:#6b7280;letter-spacing:-0.5px;">Nepal</span>
            </td>
          </tr>
          <tr>
            <td style="background:linear-gradient(135deg,#111118 0%,#0d0d14 100%);border:1px solid #1f2937;border-radius:16px;padding:40px 36px;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding-top:24px;text-align:center;font-size:12px;color:#4b5563;">
              <p style="margin:0 0 4px;">&copy; ${new Date().getFullYear()} CHDS Nepal. All rights reserved.</p>
              <p style="margin:0;">This is an automated message. Please do not reply directly.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

export const sendPasswordResetEmail = async (email: string, token: string) => {
  const frontendUrl = process.env.FRONTEND_URL || 'https://localhost';
  const resetLink = `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const transporter = createTransporter();
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'chds@chds.np',
    to: email,
    subject: 'Reset your CHDS password',
    html: baseHtml(`
      <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f9fafb;">Forgot your password?</h2>
      <p style="margin:0 0 24px;font-size:15px;color:#9ca3af;line-height:1.6;">
        No worries : click the button below to reset it. This link expires in <strong style="color:#10b981;">1 hour</strong>.
      </p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr>
          <td style="border-radius:10px;background-color:#10b981;padding:14px 28px;">
            <a href="${escapeHtml(resetLink)}" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;display:inline-block;">Reset Password</a>
          </td>
        </tr>
      </table>
      <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">
        If the button doesn't work, paste this into your browser:<br>
        <span style="color:#9ca3af;word-break:break-all;">${escapeHtml(resetLink)}</span>
      </p>
      <hr style="border:none;border-top:1px solid #1f2937;margin:24px 0;">
      <p style="margin:0;font-size:13px;color:#6b7280;">If you didn't request this, you can safely ignore this email.</p>
    `),
  });
};

export const sendTempPasswordEmail = async (email: string, tempPassword: string) => {
  const frontendUrl = process.env.FRONTEND_URL || 'https://localhost';
  const loginLink = `${frontendUrl}/login`;
  const transporter = createTransporter();
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'chds@chds.np',
    to: email,
    subject: 'Welcome to CHDS : your account is ready',
    html: baseHtml(`
      <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f9fafb;">Account created</h2>
      <p style="margin:0 0 24px;font-size:15px;color:#9ca3af;line-height:1.6;">
        An account has been created for you on the CHDS Nepal platform.
      </p>
      <div style="background:#0d1117;border:1px solid #1f2937;border-radius:10px;padding:16px;margin-bottom:24px;">
        <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">Temporary password</p>
        <p style="margin:0;font-size:18px;font-weight:700;color:#10b981;letter-spacing:1px;font-family:monospace;">${escapeHtml(tempPassword)}</p>
      </div>
      <p style="margin:0 0 24px;font-size:14px;color:#f59e0b;">You'll be required to change this password on first login.</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr>
          <td style="border-radius:10px;background-color:#10b981;padding:14px 28px;">
            <a href="${escapeHtml(loginLink)}" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;display:inline-block;">Log In</a>
          </td>
        </tr>
      </table>
    `),
  });
};

export const sendEmail = async (to: string, subject: string, html: string) => {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'chds@chds.np',
    to,
    subject,
    html: baseHtml(html),
  });
};

export const sendInviteEmail = async (email: string, inviteToken: string, role: string, hospitalId?: string) => {
  const frontendUrl = process.env.FRONTEND_URL || 'https://localhost';
  let inviteLink = `${frontendUrl}/register?invite=${encodeURIComponent(inviteToken)}&role=${encodeURIComponent(role)}`;
  if (hospitalId) inviteLink += `&hospital=${encodeURIComponent(hospitalId)}`;
  const transporter = createTransporter();
  const roleBadge = role === 'doctor' ? 'Doctor' : role === 'admin' ? 'Admin' : 'Patient';
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'chds@chds.np',
    to: email,
    subject: `You're invited to join CHDS as a ${role}`,
    html: baseHtml(`
      <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f9fafb;">You've been invited</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
        You have been invited to join <strong style="color:#f9fafb;">CHDS Nepal</strong> as:
      </p>
      <div style="text-align:center;margin-bottom:24px;">
        <span style="display:inline-block;background:#111827;border:1px solid #374151;border-radius:20px;padding:8px 20px;font-size:15px;color:#f9fafb;">${roleBadge}</span>
      </div>
      <p style="margin:0 0 24px;font-size:14px;color:#9ca3af;line-height:1.5;">
        Click below to set your password and activate your account. This invite expires in <strong style="color:#10b981;">48 hours</strong>.
      </p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr>
          <td style="border-radius:10px;background-color:#10b981;padding:14px 28px;">
            <a href="${escapeHtml(inviteLink)}" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;display:inline-block;">Accept Invite</a>
          </td>
        </tr>
      </table>
    `),
  });
};
