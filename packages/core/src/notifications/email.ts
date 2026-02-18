/**
 * Email notification service using Nodemailer.
 * Supports SMTP transport with configurable sender.
 */
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface EmailConfig {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
}

export interface SendEmailResult {
  ok: boolean;
  messageId: string;
  accepted: string[];
  rejected: string[];
}

export class EmailService {
  private transporter: Transporter;

  constructor(private readonly config: EmailConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure ?? (config.port === 465),
      auth: config.user
        ? { user: config.user, pass: config.pass ?? '' }
        : undefined,
    });
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const recipients = Array.isArray(input.to) ? input.to.join(', ') : input.to;

    const info = await this.transporter.sendMail({
      from: this.config.from,
      to: recipients,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });

    return {
      ok: true,
      messageId: info.messageId,
      accepted: (info.accepted ?? []).map(String),
      rejected: (info.rejected ?? []).map(String),
    };
  }

  async verify(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Creates a no-op email service when SMTP is not configured.
 * Logs emails to console instead of sending.
 */
export class ConsoleEmailService {
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    console.log(`[email:console] to=${Array.isArray(input.to) ? input.to.join(',') : input.to} subject="${input.subject}"`);
    return {
      ok: true,
      messageId: `console-${Date.now()}`,
      accepted: Array.isArray(input.to) ? input.to : [input.to],
      rejected: [],
    };
  }

  async verify(): Promise<boolean> {
    return true;
  }
}

/**
 * Factory: returns a real EmailService if SMTP config is provided,
 * otherwise returns a ConsoleEmailService for development.
 */
export function createEmailService(config?: Partial<EmailConfig>): EmailService | ConsoleEmailService {
  if (config?.host && config?.from) {
    return new EmailService({
      host: config.host,
      port: config.port ?? 587,
      secure: config.secure,
      user: config.user,
      pass: config.pass,
      from: config.from,
    });
  }

  return new ConsoleEmailService();
}
