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

  await transport.sendMail({
    from: emailEnv.AUTH_EMAIL_FROM,
    to: message.to,
    replyTo: message.replyTo,
    subject: message.subject,
    text: message.text,
    html: message.html,
    messageId: `<${safeMessageId}@tcghaven.com>`,
  });
}

const authEmailHtml = (input: {
  heading: string;
  copy: string;
  actionLabel: string;
  actionUrl: string;
}) => `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f6f5;color:#111713;font-family:Arial,sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:40px 20px">
      <div style="background:#0a0d0c;color:#ffffff;padding:18px 24px;font-weight:700">TCGHaven</div>
      <div style="background:#ffffff;padding:32px 24px">
        <h1 style="margin:0 0 12px;font-size:24px">${escapeEmailHtml(input.heading)}</h1>
        <p style="margin:0 0 24px;line-height:1.6;color:#46514b">${escapeEmailHtml(input.copy)}</p>
        <a href="${escapeEmailHtml(input.actionUrl)}" style="display:inline-block;background:#10b981;color:#07110d;text-decoration:none;font-weight:700;padding:13px 18px;border-radius:8px">${escapeEmailHtml(input.actionLabel)}</a>
        <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#65716a">If you did not request this, you can ignore this email.</p>
      </div>
    </div>
  </body>
</html>`;

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
