import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailNotifier } from '../../src/email/notifier';
import { StockScore } from '../../src/types/analysis';

describe('Email Notifier', () => {
  let notifier: EmailNotifier;

  beforeEach(() => {
    notifier = new EmailNotifier({
      smtpHost: 'smtp.test.com',
      smtpPort: 587,
      user: 'test@test.com',
      pass: 'testpass',
      recipientEmail: 'recipient@test.com',
    });
  });

  describe('formatEmail', () => {
    it('should format stock picks into readable email', () => {
      const mockPicks: StockScore[] = [
        {
          ticker: 'NVDA',
          companyName: 'NVIDIA Corporation',
          overallScore: 85,
          insiderScore: 90,
          congressScore: 75,
          institutionalScore: 80,
          convergenceBonus: 20,
          recentBuyers: [
            { name: 'Jensen Huang', type: 'CEO', date: new Date('2024-01-15') },
            { name: 'Nancy Pelosi', type: 'Congress', date: new Date('2024-01-10') },
          ],
          signals: {
            insiderBuys: 3,
            congressBuys: 2,
            institutionalIncreases: 5,
          },
        },
        {
          ticker: 'AAPL',
          companyName: 'Apple Inc.',
          overallScore: 72,
          insiderScore: 65,
          congressScore: 80,
          institutionalScore: 70,
          convergenceBonus: 15,
          recentBuyers: [
            { name: 'Tim Cook', type: 'CEO', date: new Date('2024-01-12') },
          ],
          signals: {
            insiderBuys: 2,
            congressBuys: 1,
            institutionalIncreases: 3,
          },
        },
      ];

      const emailContent = notifier.formatEmail(mockPicks);

      expect(emailContent.subject).toContain('Stock Pick');
      expect(emailContent.html).toContain('NVDA');
      expect(emailContent.html).toContain('AAPL');
      expect(emailContent.html).toContain('85');
      expect(emailContent.html).toContain('Jensen Huang');
    });
  });

  describe('sendNotification', () => {
    it('should send email with stock picks', async () => {
      const mockPicks: StockScore[] = [
        {
          ticker: 'TSLA',
          companyName: 'Tesla Inc.',
          overallScore: 78,
          insiderScore: 80,
          congressScore: 70,
          institutionalScore: 75,
          convergenceBonus: 18,
          recentBuyers: [],
          signals: {
            insiderBuys: 4,
            congressBuys: 1,
            institutionalIncreases: 2,
          },
        },
      ];

      // Mock the send function
      const sendSpy = vi.spyOn(notifier, 'send').mockResolvedValue({
        success: true,
        messageId: 'test-message-id',
      });

      const result = await notifier.sendNotification(mockPicks);

      expect(sendSpy).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should handle send failures gracefully', async () => {
      const mockPicks: StockScore[] = [
        {
          ticker: 'TSLA',
          companyName: 'Tesla Inc.',
          overallScore: 78,
          insiderScore: 80,
          congressScore: 70,
          institutionalScore: 75,
          convergenceBonus: 18,
          recentBuyers: [],
          signals: {
            insiderBuys: 4,
            congressBuys: 1,
            institutionalIncreases: 2,
          },
        },
      ];

      vi.spyOn(notifier, 'send').mockRejectedValue(
        new Error('SMTP connection failed')
      );

      const result = await notifier.sendNotification(mockPicks);

      expect(result.success).toBe(false);
      expect(result.error).toContain('SMTP');
    });
  });

  describe('scheduleDaily', () => {
    it('should schedule daily email at specified time', () => {
      const schedule = notifier.scheduleDaily('09:00');

      expect(schedule).toBeDefined();
      expect(schedule.time).toBe('09:00');
      expect(schedule.active).toBe(true);
    });
  });
});
