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
  const action = input.action
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 0"><tr><td bgcolor="#10b981" style="border-radius:7px"><a href="${escapeEmailHtml(input.action.url)}" style="display:inline-block;padding:14px 22px;color:#07110d;font-size:15px;line-height:20px;font-weight:800;text-decoration:none;border-radius:7px">${escapeEmailHtml(input.action.label)}</a></td></tr></table>`
    : "";
  const notice = input.notice
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:30px 0 0"><tr><td bgcolor="#eef7f3" style="padding:16px 18px;border-radius:7px;color:#34473e;font-size:13px;line-height:20px"><strong style="color:#087a57">Good to know</strong><br>${escapeEmailHtml(input.notice)}</td></tr></table>`
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
        .email-heading { font-size: 28px !important; line-height: 34px !important; }
        .email-meta { display: none !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#edf0ee;color:#101512;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeEmailHtml(input.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#edf0ee">
      <tr>
        <td align="center" style="padding:38px 16px">
          <table role="presentation" width="620" cellspacing="0" cellpadding="0" border="0" class="email-shell" style="width:620px;max-width:620px;background:#ffffff">
            <tr><td height="6" bgcolor="#10b981" style="height:6px;line-height:6px;font-size:0">&nbsp;</td></tr>
            <tr>
              <td bgcolor="#0c0f0e" class="email-pad" style="padding:24px 34px">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="color:#ffffff;font-size:20px;line-height:24px;font-weight:800;letter-spacing:-0.4px">TCG<span style="color:#24d39c">Haven</span></td>
                    <td align="right" class="email-meta" style="color:#93a19a;font-size:12px;line-height:18px">Cards, sealed products, collector essentials</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="email-pad" style="padding:42px 42px 38px">
                <p style="margin:0 0 13px;color:#087a57;font-size:12px;line-height:16px;font-weight:800;letter-spacing:1.1px;text-transform:uppercase">${escapeEmailHtml(input.label)}</p>
                <h1 class="email-heading" style="margin:0;color:#101512;font-size:34px;line-height:40px;font-weight:800;letter-spacing:-1px">${escapeEmailHtml(input.heading)}</h1>
                <p style="margin:15px 0 0;max-width:500px;color:#4c5b53;font-size:16px;line-height:25px">${escapeEmailHtml(input.intro)}</p>
                ${input.contentHtml ?? ""}
                ${action}
                ${input.afterActionHtml ?? ""}
                ${notice}
              </td>
            </tr>
            <tr>
              <td bgcolor="#0c0f0e" class="email-pad" style="padding:24px 34px;color:#98a39e;font-size:12px;line-height:19px">
                <strong style="color:#ffffff">TCGHaven</strong><br>
                Questions? Reply to this email or contact <a href="mailto:info@tcghaven.com" style="color:#5ce5b8;text-decoration:none">info@tcghaven.com</a>.
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
    afterActionHtml: `<p style="margin:24px 0 0;color:#758079;font-size:12px;line-height:19px;word-break:break-all">Button not working? Copy this secure link into your browser:<br><a href="${escapeEmailHtml(input.actionUrl)}" style="color:#087a57;text-decoration:underline">${escapeEmailHtml(input.actionUrl)}</a></p>`,
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
  const detailsHtml = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 0;background:#f3f5f4"><tr><td style="padding:18px 20px;color:#526058;font-size:13px;line-height:20px"><strong style="display:block;margin-bottom:3px;color:#101512;font-size:14px">Time</strong>${escapeEmailHtml(signedInAt)} (Amsterdam)</td></tr><tr><td style="padding:0 20px 18px;color:#526058;font-size:13px;line-height:20px"><strong style="display:block;margin-bottom:3px;color:#101512;font-size:14px">Device</strong>${escapeEmailHtml(device)}</td></tr><tr><td style="padding:0 20px 18px;color:#526058;font-size:13px;line-height:20px"><strong style="display:block;margin-bottom:3px;color:#101512;font-size:14px">IP address</strong>${escapeEmailHtml(ipAddress)}</td></tr></table>`;

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
        label: "This wasn't me — reset password",
        url: input.recoveryUrl,
      },
      notice:
        "If this was you, no action is needed. If not, reset your password immediately; completing the reset signs out every existing session.",
    }),
    idempotencyKey: `login-alert-${input.sessionId}`,
  });
};
