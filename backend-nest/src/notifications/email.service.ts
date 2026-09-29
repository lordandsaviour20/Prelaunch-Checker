import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

interface AlertEmailData {
  url: string;
  failedChecks: string[];
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend = new Resend(process.env.RESEND_API_KEY);

  async sendAlertEmail(to: string, { url, failedChecks }: AlertEmailData): Promise<void> {
    const checkList = failedChecks.map((c) => `<li>${c}</li>`).join('');

    try {
      await this.resend.emails.send({
        from: 'Prelaunch Checker <onboarding@resend.dev>',
        to,
        subject: `New issues found on ${url}`,
        html: `
          <p>Your scheduled check for <strong>${url}</strong> found new issues:</p>
          <ul>${checkList}</ul>
          <p>Log in to view the full report.</p>
        `,
      });
    } catch (err) {
      this.logger.error(
        `Failed to send alert email: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}