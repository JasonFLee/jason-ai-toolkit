import 'dotenv/config';
import { sendGmail } from './email/gmailOAuth.js';

async function test() {
  try {
    const toEmail = process.env.NOTIFICATION_EMAIL || 'jason.lee.jfl@gmail.com';
    console.log('Sending test email to:', toEmail);

    const result = await sendGmail(
      toEmail,
      'InvestBot Test Email - ' + new Date().toLocaleString(),
      '<h1>Test Email</h1><p>This is a test from InvestBot at ' + new Date().toLocaleString() + '</p><p>If you received this, emails are working!</p>',
      'Test Email - This is a test from InvestBot at ' + new Date().toLocaleString()
    );
    console.log('Email sent! Result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
