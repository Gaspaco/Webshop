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

// Email palette: a light, readable body under a dark brand header. Colours
// are written out in full because many clients ignore CSS variables.
const EMAIL = {
  page: "#f3f4f3",
  card: "#ffffff",
  header: "#111111",
  brand: "#10b981",
  brandInk: "#04231a",
  accent: "#047857",
  text: "#111111",
  body: "#3f4743",
  muted: "#6b7470",
  line: "#e6e8e7",
  panel: "#f6f7f6",
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
};

// Email clients need an absolute https URL for images. Local development has
// no public address, so previews use the live site.
function emailAssetUrl(path: string) {
  const base = process.env.PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || "";
  try {
    const url = new URL(path, base);
    if (url.protocol === "https:") return url.toString();
  } catch {
    // Fall through to the public site.
  }
  return new URL(path, "https://www.tcghaven.com").toString();
}

const table = (style: string, rows: string) =>
  `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="${style}">${rows}</table>`;

/** A soft grey box for addresses, notes and other grouped content. */
export function emailPanel(innerHtml: string) {
  return table(
    `margin:24px 0 0;background:${EMAIL.panel};border-radius:12px`,
    `<tr><td style="padding:18px 20px;color:${EMAIL.body};font-family:${EMAIL.font};font-size:14px;line-height:22px">${innerHtml}</td></tr>`,
  );
}

/** Label/value rows, e.g. order number, time, device. Values are escaped. */
export function emailDetails(rows: Array<{ label: string; value?: string; valueHtml?: string }>) {
  const body = rows
    .map(
      (row, index) =>
        `<tr><td style="padding:${index === 0 ? "16px" : "12px"} 20px ${index === rows.length - 1 ? "16px" : "12px"};${index ? `border-top:1px solid ${EMAIL.line};` : ""}color:${EMAIL.muted};font-family:${EMAIL.font};font-size:13px;line-height:20px;white-space:nowrap;vertical-align:top">${escapeEmailHtml(row.label)}</td><td align="right" style="padding:${index === 0 ? "16px" : "12px"} 20px ${index === rows.length - 1 ? "16px" : "12px"} 12px;${index ? `border-top:1px solid ${EMAIL.line};` : ""}color:${EMAIL.text};font-family:${EMAIL.font};font-size:14px;line-height:20px;font-weight:600;text-align:right;word-break:break-word">${row.valueHtml ?? escapeEmailHtml(row.value ?? "")}</td></tr>`,
    )
    .join("");
  return table(`margin:24px 0 0;background:${EMAIL.panel};border-radius:12px`, body);
}

/** One value that matters most, shown large: a tracking number or reference. */
export function emailHighlight(label: string, value: string) {
  return table(
    `margin:24px 0 0;background:${EMAIL.panel};border-radius:12px`,
    `<tr><td style="padding:18px 20px"><span style="display:block;color:${EMAIL.muted};font-family:${EMAIL.font};font-size:13px;line-height:20px">${escapeEmailHtml(label)}</span><span style="display:block;margin-top:2px;color:${EMAIL.text};font-family:${EMAIL.font};font-size:20px;line-height:28px;font-weight:700;letter-spacing:0.5px;word-break:break-all">${escapeEmailHtml(value)}</span></td></tr>`,
  );
}

/** A one-time code, spaced out and easy to read or copy. */
export function emailCode(code: string) {
  return table(
    "margin:28px 0 0",
    `<tr><td align="center" style="padding:22px 16px;background:${EMAIL.panel};border-radius:12px;color:${EMAIL.text};font-family:${EMAIL.font};font-size:34px;line-height:40px;font-weight:700;letter-spacing:10px">${escapeEmailHtml(code)}</td></tr>`,
  );
}

/** A quoted message with a thin brand bar, for customer messages. */
export function emailMessage(title: string, message: string) {
  return table(
    "margin:24px 0 0",
    `<tr><td width="3" style="width:3px;background:${EMAIL.brand};border-radius:2px;font-size:0;line-height:0">&nbsp;</td><td style="padding:2px 0 2px 16px;color:${EMAIL.body};font-family:${EMAIL.font};font-size:14px;line-height:23px"><strong style="display:block;margin-bottom:6px;color:${EMAIL.text};font-size:13px">${escapeEmailHtml(title)}</strong>${escapeEmailHtml(message).replaceAll("\n", "<br>")}</td></tr>`,
  );
}

/** Plain paragraphs from multi-line text, escaped. */
export function emailParagraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map(
      paragraph =>
        `<p style="margin:16px 0 0;color:${EMAIL.body};font-family:${EMAIL.font};font-size:15px;line-height:25px">${escapeEmailHtml(paragraph).replaceAll("\n", "<br>")}</p>`,
    )
    .join("");
}

/** An address or contact block inside a panel. Lines are escaped. */
export function emailAddress(title: string, lines: string[]) {
  return emailPanel(
    `<strong style="display:block;margin-bottom:4px;color:${EMAIL.text};font-size:13px">${escapeEmailHtml(title)}</strong>${lines.map(line => escapeEmailHtml(line)).join("<br>")}`,
  );
}

/** The items in an order, with the totals underneath. */
export function emailOrderItems(
  items: Array<{ name: string; quantity: number; total: string }>,
  summary: Array<{ label: string; value: string; total?: boolean; accent?: boolean }>,
) {
  const itemRows = items
    .map(
      item =>
        `<tr><td style="padding:14px 0;border-bottom:1px solid ${EMAIL.line};color:${EMAIL.text};font-family:${EMAIL.font};font-size:14px;line-height:21px"><span style="display:inline-block;min-width:26px;color:${EMAIL.muted}">${item.quantity}×</span>${escapeEmailHtml(item.name)}</td><td align="right" style="padding:14px 0 14px 12px;border-bottom:1px solid ${EMAIL.line};color:${EMAIL.text};font-family:${EMAIL.font};font-size:14px;line-height:21px;white-space:nowrap">${escapeEmailHtml(item.total)}</td></tr>`,
    )
    .join("");
  const summaryRows = summary
    .map(row => {
      const color = row.accent ? EMAIL.accent : row.total ? EMAIL.text : EMAIL.muted;
      const size = row.total ? "16px" : "14px";
      const weight = row.total ? "700" : "400";
      const top = row.total ? `padding-top:14px;border-top:1px solid ${EMAIL.line};` : "padding-top:4px;";
      return `<tr><td style="${top}padding-bottom:4px;color:${color};font-family:${EMAIL.font};font-size:${size};line-height:22px;font-weight:${weight}">${escapeEmailHtml(row.label)}</td><td align="right" style="${top}padding-bottom:4px;color:${color};font-family:${EMAIL.font};font-size:${size};line-height:22px;font-weight:${weight};white-space:nowrap">${escapeEmailHtml(row.value)}</td></tr>`;
    })
    .join("");
  return (
    table("margin:24px 0 0", itemRows) +
    table("margin:14px 0 0", summaryRows)
  );
}

/** Fallback for when a button does not work. */
export function emailFallbackLink(url: string) {
  return `<p style="margin:24px 0 0;color:${EMAIL.muted};font-family:${EMAIL.font};font-size:12px;line-height:19px;word-break:break-all">Button not working? Copy this link into your browser:<br><a href="${escapeEmailHtml(url)}" style="color:${EMAIL.accent};text-decoration:underline">${escapeEmailHtml(url)}</a></p>`;
}

/**
 * Shared, table-based email chrome for reliable rendering in Gmail, Outlook,
 * Apple Mail, and narrow mobile clients. Callers must escape dynamic HTML used
 * in contentHtml before passing it to this renderer (the email* helpers above
 * do this for you).
 */
export function renderTransactionalEmail(input: TransactionalEmailTemplate) {
  const actionArrow = input.action?.showArrow === false ? "" : "&nbsp;&nbsp;&rarr;";
  const action = input.action
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:32px 0 0"><tr><td bgcolor="${EMAIL.brand}" style="border-radius:999px"><a href="${escapeEmailHtml(input.action.url)}" style="display:inline-block;padding:14px 26px;color:${EMAIL.brandInk};font-family:${EMAIL.font};font-size:15px;line-height:20px;font-weight:700;text-decoration:none;border-radius:999px">${escapeEmailHtml(input.action.label)}${actionArrow}</a></td></tr></table>`
    : "";
  const notice = input.notice
    ? table(
        `margin:32px 0 0;background:${EMAIL.panel};border-radius:12px`,
        `<tr><td style="padding:16px 20px;color:${EMAIL.body};font-family:${EMAIL.font};font-size:13px;line-height:21px"><strong style="display:block;margin-bottom:2px;color:${EMAIL.text}">Good to know</strong>${escapeEmailHtml(input.notice)}</td></tr>`,
      )
    : "";
  const logo = emailAssetUrl("/images/logo-mark.png");
  const home = emailAssetUrl("/");

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
        .email-main { padding-top: 32px !important; padding-bottom: 32px !important; }
        .email-heading { font-size: 25px !important; line-height: 31px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:${EMAIL.page};color:${EMAIL.text};font-family:${EMAIL.font};-webkit-text-size-adjust:100%;word-spacing:normal">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeEmailHtml(input.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${EMAIL.page}" style="background:${EMAIL.page}">
      <tr>
        <td align="center" style="padding:32px 12px 40px">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" class="email-shell" style="width:600px;max-width:600px">
            <tr>
              <td bgcolor="${EMAIL.header}" class="email-pad" style="padding:20px 36px;background:${EMAIL.header};border-radius:16px 16px 0 0">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="vertical-align:middle">
                      <a href="${escapeEmailHtml(home)}" style="text-decoration:none">
                        <img src="${escapeEmailHtml(logo)}" width="30" height="28" alt="" style="display:inline-block;width:30px;height:28px;border:0;vertical-align:middle">
                        <span style="display:inline-block;margin-left:8px;color:${EMAIL.brand};font-family:${EMAIL.font};font-size:18px;line-height:28px;font-weight:800;letter-spacing:-0.3px;vertical-align:middle">TCG Haven</span>
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td bgcolor="${EMAIL.card}" class="email-pad email-main" style="padding:40px 44px 40px;background:${EMAIL.card}">
                <p style="margin:0 0 10px;color:${EMAIL.accent};font-family:${EMAIL.font};font-size:13px;line-height:18px;font-weight:600">${escapeEmailHtml(input.label)}</p>
                <h1 class="email-heading" style="margin:0;color:${EMAIL.text};font-family:${EMAIL.font};font-size:28px;line-height:34px;font-weight:700;letter-spacing:-0.6px">${escapeEmailHtml(input.heading)}</h1>
                <p style="margin:14px 0 0;color:${EMAIL.body};font-family:${EMAIL.font};font-size:16px;line-height:26px">${escapeEmailHtml(input.intro)}</p>
                ${input.contentHtml ?? ""}
                ${action}
                ${input.afterActionHtml ?? ""}
                ${notice}
              </td>
            </tr>
            <tr>
              <td bgcolor="#fafafa" class="email-pad" style="padding:24px 44px 26px;background:#fafafa;border-top:1px solid ${EMAIL.line};border-radius:0 0 16px 16px;color:${EMAIL.muted};font-family:${EMAIL.font};font-size:12px;line-height:19px">
                Questions? Write to us at <a href="mailto:info@tcghaven.com" style="color:${EMAIL.accent};text-decoration:none;font-weight:600">info@tcghaven.com</a>.
                <br><br>
                <strong style="color:${EMAIL.body}">TCGHaven</strong> · Herman Robbersstraat 68e, Rotterdam<br>
                KVK 88839621 · VAT NL004659858B77<br>
                Secure payments by Mollie · Delivery by PostNL
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
    afterActionHtml: emailFallbackLink(input.actionUrl),
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
  const codeHtml = emailCode(code);

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
  const detailsHtml = emailDetails([
    { label: "Time", value: `${signedInAt} (Amsterdam)` },
    { label: "Device", value: device },
    { label: "IP address", value: ipAddress },
  ]);

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
