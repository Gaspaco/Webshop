import nodemailer, { type Transporter } from "nodemailer";
import { getEmailEnv } from "~/lib/env.server";

type AuthEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
  replyTo?: string;
};

export const escapeEmailHtml = (value: string) =>
  value.replace(
    /[&<>"]/g,
    character =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
      })[character]!,
  );

type EmailAction = {
  label: string;
  url: string;
  showArrow?: boolean;
};

type TransactionalEmailTemplate = {
  preheader: string;
  label: string;
  heading: string;
  intro: string;
  contentHtml?: string;
  afterActionHtml?: string;
  action?: EmailAction;
  notice?: string;
};

/**
 * Shared, table-based email chrome for reliable rendering in Gmail, Outlook,
 * Apple Mail, and narrow mobile clients. Callers must escape dynamic HTML used
 * in contentHtml before passing it to this renderer.
 */
export function renderTransactionalEmail(input: TransactionalEmailTemplate) {
  const actionArrow = input.action?.showArrow === false ? "" : "&nbsp;&nbsp;→";
  const action = input.action
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:30px 0 0"><tr><td bgcolor="#19c892" style="border-radius:6px"><a href="${escapeEmailHtml(input.action.url)}" style="display:inline-block;padding:15px 24px;color:#07110d;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:800;text-decoration:none;border-radius:6px">${escapeEmailHtml(input.action.label)}${actionArrow}</a></td></tr></table>`
    : "";
  const notice = input.notice
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:32px 0 0"><tr><td width="4" bgcolor="#19c892" style="width:4px;font-size:0;line-height:0">&nbsp;</td><td bgcolor="#17201c" style="padding:16px 18px;color:#bac5bf;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:21px"><strong style="display:block;margin-bottom:3px;color:#ffffff;font-size:13px">Good to know</strong>${escapeEmailHtml(input.notice)}</td></tr></table>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light only">
    <meta name="supported-color-schemes" content="light only">
    <title>${escapeEmailHtml(input.heading)}</title>
    <style>
      @media only screen and (max-width: 640px) {
        .email-shell { width: 100% !important; }
        .email-pad { padding-left: 24px !important; padding-right: 24px !important; }
        .email-main { padding-top: 34px !important; padding-bottom: 34px !important; }
        .email-heading { font-size: 29px !important; line-height: 35px !important; }
        .email-meta { display: none !important; }
        .email-footer-cell { display: block !important; width: 100% !important; text-align: left !important; }
        .email-footer-right { padding-top: 12px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#080b09;color:#ffffff;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;word-spacing:normal">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeEmailHtml(input.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#080b09" style="background:#080b09">
      <tr>
        <td align="center" style="padding:40px 16px">
          <table role="presentation" width="620" cellspacing="0" cellpadding="0" border="0" class="email-shell" style="width:620px;max-width:620px;background:#111512">
            <tr><td height="4" bgcolor="#19c892" style="height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>
            <tr>
              <td bgcolor="#0b0e0c" class="email-pad" style="padding:23px 34px">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:21px;line-height:25px;font-weight:800;letter-spacing:-0.5px"><span style="display:inline-block;margin-right:9px;padding:4px 7px;border-radius:5px;background:#19c892;color:#07110d;font-size:13px;line-height:16px;vertical-align:2px">TCG</span>Haven</td>
                    <td align="right" class="email-meta" style="color:#718078;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:18px;letter-spacing:.7px;text-transform:uppercase">Rotterdam · Est. for collectors</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td bgcolor="#111512" class="email-pad email-main" style="padding:46px 42px 42px">
                <p style="margin:0 0 14px;color:#31d9a5;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;font-weight:800;letter-spacing:1.3px;text-transform:uppercase">${escapeEmailHtml(input.label)}</p>
                <h1 class="email-heading" style="margin:0;max-width:510px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:36px;line-height:42px;font-weight:800;letter-spacing:-1.1px">${escapeEmailHtml(input.heading)}</h1>
                <p style="margin:17px 0 0;max-width:510px;color:#aeb8b2;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px">${escapeEmailHtml(input.intro)}</p>
                ${input.contentHtml ?? ""}
                ${action}
                ${input.afterActionHtml ?? ""}
                ${notice}
              </td>
            </tr>
            <tr>
              <td bgcolor="#0b0e0c" class="email-pad" style="padding:25px 34px">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td class="email-footer-cell" style="color:#7f8d85;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px">
                      <strong style="color:#ffffff">TCGHaven</strong><br>
                      Herman Robbersstraat 68e, Rotterdam<br>
                      KVK 88839621 · VAT NL004659858B77
                    </td>
                    <td align="right" class="email-footer-cell email-footer-right" style="color:#7f8d85;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px">
                      Need help? <a href="mailto:info@tcghaven.com" style="color:#5ce5b8;text-decoration:none">info@tcghaven.com</a><br>
                      Secure payments by Mollie · Delivery by PostNL
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

let smtpTransport: Transporter | null = null;
let smtpTransportKey = "";

function getSmtpTransport() {
  const emailEnv = getEmailEnv();
  if (!emailEnv) throw new Error("Transactional email is not configured.");

  const transportKey = `${emailEnv.SMTP_HOST}:${emailEnv.SMTP_PORT}:${emailEnv.SMTP_USER}`;
  if (smtpTransport && smtpTransportKey === transportKey) {
    return { emailEnv, transport: smtpTransport };
  }

  smtpTransport = nodemailer.createTransport({
    host: emailEnv.SMTP_HOST,
    port: emailEnv.SMTP_PORT,
    secure: emailEnv.SMTP_PORT === 465,
    requireTLS: emailEnv.SMTP_PORT === 587,
    auth: {
      user: emailEnv.SMTP_USER,
      pass: emailEnv.SMTP_PASS,
    },
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 15_000,
    disableFileAccess: true,
    disableUrlAccess: true,
    tls: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
      servername: emailEnv.SMTP_HOST,
    },
  });
  smtpTransportKey = transportKey;

  return { emailEnv, transport: smtpTransport };
}

const tokenFingerprint = async (token: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
};

export async function sendTransactionalEmail(message: AuthEmail) {
  const { emailEnv, transport } = getSmtpTransport();
  const safeMessageId = message.idempotencyKey
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 160);

  const delivery = await transport.sendMail({
    from: emailEnv.AUTH_EMAIL_FROM,
    to: message.to,
    replyTo: message.replyTo,
    subject: message.subject,
    text: message.text,
    html: message.html,
    messageId: `<${safeMessageId}@tcghaven.com>`,
  });

  const accepted = Array.isArray(delivery.accepted)
    ? delivery.accepted.map(String)
    : [];
  const rejected = Array.isArray(delivery.rejected)
    ? delivery.rejected.map(String)
    : [];
  if (accepted.length === 0 || rejected.length > 0) {
    throw new Error("The SMTP server did not accept every recipient.");
  }

  return { messageId: String(delivery.messageId ?? "") };
}

const authEmailHtml = (input: {
  heading: string;
  copy: string;
  actionLabel: string;
  actionUrl: string;
}) =>
  renderTransactionalEmail({
    preheader: input.copy,
    label: "Account security",
    heading: input.heading,
    intro: input.copy,
    action: {
      label: input.actionLabel,
      url: input.actionUrl,
    },
    afterActionHtml: `<p style="margin:24px 0 0;color:#718078;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;word-break:break-all">Button not working? Copy this secure link into your browser:<br><a href="${escapeEmailHtml(input.actionUrl)}" style="color:#5ce5b8;text-decoration:underline">${escapeEmailHtml(input.actionUrl)}</a></p>`,
    notice: "If you did not request this, no action is needed. Your account remains unchanged.",
  });

export const sendVerificationEmail = async (input: {
  email: string;
  url: string;
  token: string;
}) =>
  sendTransactionalEmail({
    to: input.email,
    subject: "Verify your TCGHaven email",
    text: `Verify your email address by opening this link: ${input.url}\n\nIf you did not create a TCGHaven account, you can ignore this email.`,
    html: authEmailHtml({
      heading: "Verify your email",
      copy: "Confirm that this email address belongs to you before signing in to your account.",
      actionLabel: "Verify email",
      actionUrl: input.url,
    }),
    idempotencyKey: `verify-${await tokenFingerprint(input.token)}`,
  });

export const sendPasswordResetEmail = async (input: {
  email: string;
  url: string;
  token: string;
}) =>
  sendTransactionalEmail({
    to: input.email,
    subject: "Reset your TCGHaven password",
    text: `Reset your password by opening this link: ${input.url}\n\nIf you did not request a password reset, you can ignore this email.`,
    html: authEmailHtml({
      heading: "Reset your password",
      copy: "Use this one-time link to choose a new password for your TCGHaven account.",
      actionLabel: "Reset password",
      actionUrl: input.url,
    }),
    idempotencyKey: `reset-${await tokenFingerprint(input.token)}`,
  });

export const sendTwoFactorCodeEmail = async (input: {
  email: string;
  name?: string | null;
  otp: string;
}) => {
  const greeting = input.name?.trim() ? `Hi ${input.name.trim()}, ` : "";
  const code = input.otp.replace(/\D/g, "");
  const codeHtml = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:30px 0 0"><tr><td bgcolor="#0b0e0c" align="center" style="padding:24px;border:1px solid #24312b;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:35px;line-height:42px;font-weight:800;letter-spacing:9px">${escapeEmailHtml(code)}</td></tr></table>`;

  return sendTransactionalEmail({
    to: input.email,
    subject: `${code} is your TCGHaven security code`,
    text: `${greeting}use this one-time code to finish signing in to TCGHaven: ${code}\n\nThe code expires in 5 minutes. Never share it with anyone. If you did not try to sign in, reset your password immediately.`,
    html: renderTransactionalEmail({
      preheader: `${code} is your one-time TCGHaven security code.`,
      label: "Two-factor authentication",
      heading: "Finish signing in",
      intro: `${greeting}enter this one-time code on the TCGHaven sign-in screen.`,
      contentHtml: codeHtml,
      notice:
        "This code expires in 5 minutes and can only be used once. TCGHaven will never ask you to share it by phone, chat, or email.",
    }),
    idempotencyKey: `two-factor-${await tokenFingerprint(`${input.email}:${code}`)}`,
  });
};

export function describeLoginDevice(userAgent?: string | null) {
  if (!userAgent) return "Unknown browser or device";

  const browser = /Edg\//.test(userAgent)
    ? "Microsoft Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Chrome\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Web browser";
  const platform = /iPhone/.test(userAgent)
    ? "iPhone"
    : /iPad/.test(userAgent)
      ? "iPad"
      : /Android/.test(userAgent)
        ? "Android"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Macintosh|Mac OS X/.test(userAgent)
            ? "macOS"
            : /Linux/.test(userAgent)
              ? "Linux"
              : "unknown device";

  return `${browser} on ${platform}`;
}

export const sendNewSignInEmail = async (input: {
  email: string;
  name?: string | null;
  signedInAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  recoveryUrl: string;
  sessionId: string;
}) => {
  const device = describeLoginDevice(input.userAgent);
  const signedInAt = new Intl.DateTimeFormat("en-NL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Amsterdam",
  }).format(input.signedInAt);
  const ipAddress = input.ipAddress?.trim() || "Not available";
  const greeting = input.name?.trim() ? `Hi ${input.name.trim()}, ` : "";
  const detailsHtml = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0b0e0c" style="margin:30px 0 0;background:#0b0e0c;border:1px solid #24312b"><tr><td style="padding:18px 20px;color:#aeb8b2;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px"><strong style="display:block;margin-bottom:3px;color:#ffffff;font-size:13px">Time</strong>${escapeEmailHtml(signedInAt)} (Amsterdam)</td></tr><tr><td style="padding:0 20px 18px;color:#aeb8b2;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px"><strong style="display:block;margin-bottom:3px;color:#ffffff;font-size:13px">Device</strong>${escapeEmailHtml(device)}</td></tr><tr><td style="padding:0 20px 18px;color:#aeb8b2;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px"><strong style="display:block;margin-bottom:3px;color:#ffffff;font-size:13px">IP address</strong>${escapeEmailHtml(ipAddress)}</td></tr></table>`;

  return sendTransactionalEmail({
    to: input.email,
    subject: "New sign-in to your TCGHaven account",
    text: `${greeting}a new sign-in to your TCGHaven account was completed.\n\nTime: ${signedInAt} (Amsterdam)\nDevice: ${device}\nIP address: ${ipAddress}\n\nIf this was not you, reset your password now: ${input.recoveryUrl}`,
    html: renderTransactionalEmail({
      preheader: "A new sign-in to your TCGHaven account was completed.",
      label: "Security notification",
      heading: "New sign-in to your account",
      intro: `${greeting}a new sign-in to your TCGHaven account was completed.`,
      contentHtml: detailsHtml,
      action: {
        label: "This wasn't me: reset password",
        url: input.recoveryUrl,
        showArrow: false,
      },
      notice:
        "If this was you, no action is needed. If not, reset your password immediately; completing the reset signs out every existing session.",
    }),
    idempotencyKey: `login-alert-${input.sessionId}`,
  });
};
