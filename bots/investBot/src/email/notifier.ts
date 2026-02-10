import nodemailer from 'nodemailer';
import { StockScore } from '../types/analysis';

interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  user: string;
  pass: string;
  recipientEmail: string;
  secure?: boolean;
}

interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface Schedule {
  time: string;
  active: boolean;
  intervalId?: NodeJS.Timeout;
}

export class EmailNotifier {
  private config: EmailConfig;
  private transporter: nodemailer.Transporter;
  private schedule: Schedule | null = null;

  constructor(config: EmailConfig) {
    this.config = config;
    this.transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.secure ?? config.smtpPort === 465,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });
  }

  formatEmail(picks: StockScore[]): EmailContent {
    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const subject = `🎯 InvestBot Stock Picks - ${date}`;

    // Generate text version
    let text = `InvestBot Stock Picks for ${date}\n`;
    text += '=' .repeat(50) + '\n\n';

    for (const pick of picks) {
      text += `${pick.ticker} - Score: ${pick.overallScore.toFixed(1)}/100\n`;
      text += `Company: ${pick.companyName || 'N/A'}\n`;
      text += `Insider Score: ${pick.insiderScore.toFixed(1)} | Congress: ${pick.congressScore.toFixed(1)} | Institutional: ${pick.institutionalScore.toFixed(1)}\n`;
      text += `Recent Activity: ${pick.signals.insiderBuys} insider buys, ${pick.signals.congressBuys} congress buys, ${pick.signals.institutionalIncreases} institutional increases\n`;

      if (pick.recentBuyers.length > 0) {
        text += 'Notable Buyers:\n';
        for (const buyer of pick.recentBuyers.slice(0, 3)) {
          const amount = buyer.amount
            ? `$${(buyer.amount / 1000).toFixed(0)}K`
            : buyer.amountRange
              ? `$${(buyer.amountRange.min / 1000).toFixed(0)}K-$${(buyer.amountRange.max / 1000).toFixed(0)}K`
              : '';
          text += `  - ${buyer.name} (${buyer.type}) ${amount}\n`;
        }
      }
      text += '\n' + '-'.repeat(40) + '\n\n';
    }

    text += '\n⚠️ Disclaimer: This is not financial advice. Do your own research before investing.\n';

    // Generate HTML version
    let html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
    .header h1 { margin: 0; }
    .stock-card { background: #f8f9fa; border-radius: 10px; padding: 20px; margin-bottom: 15px; border-left: 4px solid #667eea; }
    .score-badge { display: inline-block; background: #667eea; color: white; padding: 5px 15px; border-radius: 20px; font-weight: bold; }
    .score-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 15px 0; }
    .score-item { text-align: center; padding: 10px; background: white; border-radius: 5px; }
    .score-item .value { font-size: 24px; font-weight: bold; color: #667eea; }
    .score-item .label { font-size: 12px; color: #666; }
    .buyers-list { background: white; padding: 15px; border-radius: 5px; margin-top: 10px; }
    .buyer-item { padding: 5px 0; border-bottom: 1px solid #eee; }
    .buyer-item:last-child { border-bottom: none; }
    .buyer-type { display: inline-block; background: #e3e8ff; color: #667eea; padding: 2px 8px; border-radius: 10px; font-size: 11px; }
    .disclaimer { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 5px; margin-top: 20px; }
    .signals { display: flex; gap: 15px; margin: 10px 0; }
    .signal { padding: 5px 10px; background: #e8f5e9; border-radius: 5px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎯 InvestBot Stock Picks</h1>
    <p>${date}</p>
  </div>
`;

    for (const pick of picks) {
      html += `
  <div class="stock-card">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h2 style="margin: 0;">${pick.ticker}</h2>
        <p style="margin: 5px 0; color: #666;">${pick.companyName || ''}</p>
      </div>
      <div class="score-badge">${pick.overallScore.toFixed(0)}/100</div>
    </div>

    <div class="score-grid">
      <div class="score-item">
        <div class="value">${pick.insiderScore.toFixed(0)}</div>
        <div class="label">Insider Score</div>
      </div>
      <div class="score-item">
        <div class="value">${pick.congressScore.toFixed(0)}</div>
        <div class="label">Congress Score</div>
      </div>
      <div class="score-item">
        <div class="value">${pick.institutionalScore.toFixed(0)}</div>
        <div class="label">Institutional Score</div>
      </div>
    </div>

    <div class="signals">
      <span class="signal">📊 ${pick.signals.insiderBuys} Insider Buys</span>
      <span class="signal">🏛️ ${pick.signals.congressBuys} Congress Buys</span>
      <span class="signal">🏦 ${pick.signals.institutionalIncreases} Institutional Increases</span>
    </div>
`;

      if (pick.recentBuyers.length > 0) {
        html += `
    <div class="buyers-list">
      <strong>Notable Buyers:</strong>
`;
        for (const buyer of pick.recentBuyers.slice(0, 5)) {
          const amount = buyer.amount
            ? `$${(buyer.amount / 1000).toFixed(0)}K`
            : buyer.amountRange
              ? `$${(buyer.amountRange.min / 1000).toFixed(0)}K-$${(buyer.amountRange.max / 1000).toFixed(0)}K`
              : '';
          const dateStr = new Date(buyer.date).toLocaleDateString();

          html += `
      <div class="buyer-item">
        ${buyer.name} <span class="buyer-type">${buyer.type}</span>
        <span style="float: right; color: #666;">${amount} • ${dateStr}</span>
      </div>
`;
        }
        html += `
    </div>
`;
      }

      html += `
  </div>
`;
    }

    html += `
  <div class="disclaimer">
    <strong>⚠️ Disclaimer:</strong> This is not financial advice. The information provided is for educational purposes only. Always do your own research and consult with a qualified financial advisor before making investment decisions.
  </div>

  <p style="text-align: center; color: #999; margin-top: 30px;">
    Generated by InvestBot • Insider Convergence Analysis System
  </p>
</body>
</html>
`;

    return { subject, text, html };
  }

  async send(content: EmailContent): Promise<SendResult> {
    try {
      const info = await this.transporter.sendMail({
        from: `"InvestBot" <${this.config.user}>`,
        to: this.config.recipientEmail,
        subject: content.subject,
        text: content.text,
        html: content.html,
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async sendNotification(picks: StockScore[]): Promise<SendResult> {
    try {
      if (picks.length === 0) {
        return {
          success: true,
          messageId: 'no-picks',
        };
      }

      const content = this.formatEmail(picks);
      return await this.send(content);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  scheduleDaily(time: string): Schedule {
    // Parse time (HH:MM format)
    const [hours, minutes] = time.split(':').map(Number);

    const schedule: Schedule = {
      time,
      active: true,
    };

    const scheduleNextRun = () => {
      const now = new Date();
      const scheduledTime = new Date(now);
      scheduledTime.setHours(hours, minutes, 0, 0);

      // If the time has passed today, schedule for tomorrow
      if (scheduledTime <= now) {
        scheduledTime.setDate(scheduledTime.getDate() + 1);
      }

      const delay = scheduledTime.getTime() - now.getTime();

      schedule.intervalId = setTimeout(async () => {
        if (schedule.active) {
          console.log(`[${new Date().toISOString()}] Running scheduled notification...`);
          // Would call analysis and send notification here
          scheduleNextRun();
        }
      }, delay);
    };

    scheduleNextRun();
    this.schedule = schedule;

    return schedule;
  }

  cancelSchedule(): void {
    if (this.schedule?.intervalId) {
      clearTimeout(this.schedule.intervalId);
      this.schedule.active = false;
    }
  }

  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch {
      return false;
    }
  }
}
