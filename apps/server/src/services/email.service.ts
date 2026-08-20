import nodemailer from "nodemailer";
import { env } from "../config/env";
import { redactSensitiveText } from "../utils/logging";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  sensitiveValues?: string[];
}

function getSmtpTransport() {
  if (!env.smtpHost) return null;

  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPassword } : undefined
  });
}

export async function sendEmail(message: EmailMessage) {
  const provider = env.emailProvider;

  if (provider === "disabled") {
    console.info(`Email disabled: ${message.subject} -> ${message.to}`);
    return { sent: false, provider };
  }

  if (provider === "smtp") {
    const transport = getSmtpTransport();
    if (!transport) {
      console.warn("EMAIL_PROVIDER=smtp configured without SMTP_HOST. Email not sent.");
      return { sent: false, provider };
    }

    await transport.sendMail({
      from: env.emailFrom,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html
    });
    return { sent: true, provider };
  }

  const safeSubject = redactSensitiveText(message.subject, message.sensitiveValues);
  console.info(`Email prepared by console provider: ${safeSubject} -> ${message.to}`);
  return { sent: false, provider: "console" };
}

export async function sendApprovalRequestEmail(input: {
  name: string;
  email: string;
  requestedAt: Date;
  approveUrl: string;
  rejectUrl: string;
  approvalToken: string;
}) {
  const subject = "Nova solicitacao de acesso ao Invest Hub";
  const text = [
    "Nova solicitacao de acesso ao Invest Hub",
    "",
    `Nome: ${input.name}`,
    `E-mail: ${input.email}`,
    `Solicitado em: ${input.requestedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
    "",
    `Aprovar usuario: ${input.approveUrl}`,
    `Rejeitar usuario: ${input.rejectUrl}`
  ].join("\n");

  const html = `
    <p><strong>Nova solicitacao de acesso ao Invest Hub</strong></p>
    <p><strong>Nome:</strong> ${input.name}</p>
    <p><strong>E-mail:</strong> ${input.email}</p>
    <p><strong>Solicitado em:</strong> ${input.requestedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
    <p><a href="${input.approveUrl}">Aprovar usuario</a></p>
    <p><a href="${input.rejectUrl}">Rejeitar usuario</a></p>
  `;

  return sendEmail({
    to: env.adminApprovalEmail,
    subject,
    text,
    html,
    sensitiveValues: [input.approvalToken]
  });
}

export async function sendUserApprovalDecisionEmail(input: { to: string; approved: boolean }) {
  return sendEmail({
    to: input.to,
    subject: input.approved ? "Seu acesso ao Invest Hub foi aprovado" : "Solicitacao de acesso ao Invest Hub",
    text: input.approved
      ? "Seu acesso ao Invest Hub foi aprovado. Voce ja pode entrar utilizando o e-mail e a senha cadastrados."
      : "Sua solicitacao de acesso ao Invest Hub nao foi aprovada.",
  });
}

export async function sendPasswordResetEmail(input: { to: string; resetUrl: string; resetToken: string }) {
  return sendEmail({
    to: input.to,
    subject: "Redefinicao de senha do Invest Hub",
    text: `Use este link para redefinir sua senha: ${input.resetUrl}`,
    html: `<p>Use este link para redefinir sua senha:</p><p><a href="${input.resetUrl}">Redefinir senha</a></p>`,
    sensitiveValues: [input.resetToken]
  });
}
