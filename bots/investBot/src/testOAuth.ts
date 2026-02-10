import 'dotenv/config';
import { getOAuth2Client, getMyEmail } from './email/gmailOAuth';

async function main() {
  console.log('Testing Gmail OAuth...');
  console.log('Environment check:');
  console.log('  GMAIL_CLIENT_ID:', process.env.GMAIL_CLIENT_ID ? 'SET' : 'NOT SET');
  console.log('  GMAIL_CLIENT_SECRET:', process.env.GMAIL_CLIENT_SECRET ? 'SET' : 'NOT SET');

  try {
    console.log('\nGetting OAuth client...');
    const client = await getOAuth2Client();
    console.log('OAuth client obtained!');

    console.log('\nGetting user email...');
    const email = await getMyEmail();
    console.log('User email:', email);

    console.log('\n✓ OAuth working correctly!');
  } catch (error) {
    console.error('\n✗ OAuth failed:', error);
  }
}

main();
