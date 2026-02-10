import 'dotenv/config';
import { google } from 'googleapis';
import * as http from 'http';
import * as url from 'url';
import open from 'open';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = join(__dirname, '../../.gmail-token.json');

const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

interface TokenData {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

export async function getOAuth2Client() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'http://localhost:3000/oauth2callback'
  );

  // Auto-save whenever Google's library refreshes tokens in the background
  oauth2Client.on('tokens', (newTokens: any) => {
    try {
      const existing = existsSync(TOKEN_PATH)
        ? JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'))
        : {};
      const updated = { ...existing, ...newTokens };
      writeFileSync(TOKEN_PATH, JSON.stringify(updated));
      console.log('OAuth tokens auto-refreshed and saved');
    } catch (err) {
      console.error('Failed to save refreshed tokens:', err);
    }
  });

  // Check if we have saved tokens
  if (existsSync(TOKEN_PATH)) {
    const tokens = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8')) as TokenData;
    oauth2Client.setCredentials(tokens);

    // Proactively refresh if expired or expiring within 5 minutes
    if (tokens.expiry_date && tokens.expiry_date <= Date.now() + 300000) {
      console.log('OAuth token expired or expiring soon, refreshing...');
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);
        // Preserve refresh_token (Google sometimes omits it in refresh response)
        const saved = { ...tokens, ...credentials };
        if (!saved.refresh_token) saved.refresh_token = tokens.refresh_token;
        writeFileSync(TOKEN_PATH, JSON.stringify(saved));
        console.log('Refreshed expired OAuth token');
      } catch (err: any) {
        console.error('Failed to refresh token:', err.message);
        throw new Error('OAuth refresh failed. Run: npx tsx src/testOAuth.ts to re-authorize.');
      }
    }

    return oauth2Client;
  }

  // Need to get new tokens via interactive auth
  const tokens = await getNewTokens(oauth2Client);
  oauth2Client.setCredentials(tokens);

  // Save tokens for future use
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
  console.log('Tokens saved to', TOKEN_PATH);

  return oauth2Client;
}

async function getNewTokens(oauth2Client: any): Promise<TokenData> {
  return new Promise((resolve, reject) => {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });

    console.log('\n🔐 Gmail OAuth Authorization Required');
    console.log('=====================================');
    console.log('\nPlease visit this URL to authorize the application:\n');
    console.log(authUrl);
    console.log('\nWaiting for authorization...\n');

    // Create a simple server to receive the OAuth callback
    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new url.URL(req.url!, 'http://localhost:3000');

        // Ignore favicon and other non-callback requests
        if (reqUrl.pathname !== '/oauth2callback') {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
          return;
        }

        const code = reqUrl.searchParams.get('code');
        const error = reqUrl.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<h1>Authorization failed</h1><p>Error: ${error}</p>`);
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (code) {
          console.log('Received authorization code, exchanging for tokens...');
          const { tokens } = await oauth2Client.getToken(code);
          console.log('Token exchange successful!');

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h1>Authorization successful!</h1><p>You can close this window.</p>');

          server.close();
          resolve(tokens as TokenData);
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>Authorization failed</h1><p>No code received.</p>');
          // Don't reject here - wait for proper callback
        }
      } catch (error) {
        console.error('OAuth callback error:', error);
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<h1>Error</h1><p>Failed to exchange code for tokens.</p>');
        server.close();
        reject(error);
      }
    });

    server.listen(3000, () => {
      console.log('OAuth callback server listening on http://localhost:3000');
      // Try to open the browser automatically
      import('open').then(({ default: open }) => {
        open(authUrl).catch(() => {
          console.log('Could not open browser automatically. Please visit the URL above.');
        });
      }).catch(() => {
        console.log('Please visit the URL above manually.');
      });
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('OAuth authorization timed out'));
    }, 300000);
  });
}

// Helper function to sleep
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Check if error is a rate limit error
function isRateLimitError(error: any): boolean {
  if (error?.code === 429) return true;
  if (error?.response?.status === 429) return true;
  if (error?.message?.includes('Rate Limit')) return true;
  if (error?.message?.includes('quota')) return true;
  if (error?.message?.includes('Too Many Requests')) return true;
  return false;
}

// Check if error is an auth error (expired/invalid token)
function isAuthError(error: any): boolean {
  if (error?.code === 401) return true;
  if (error?.response?.status === 401) return true;
  if (error?.message?.includes('invalid_grant')) return true;
  if (error?.message?.includes('Token has been expired or revoked')) return true;
  return false;
}

// Check if error is transient and retryable
function isRetryableError(error: any): boolean {
  if (isRateLimitError(error)) return true;
  if (isAuthError(error)) return true; // Will attempt token refresh on retry
  if (error?.code === 503) return true; // Service unavailable
  if (error?.code === 500) return true; // Internal server error
  if (error?.response?.status >= 500) return true;
  if (error?.message?.includes('ECONNRESET')) return true;
  if (error?.message?.includes('ETIMEDOUT')) return true;
  return false;
}

export async function sendGmail(to: string, subject: string, htmlBody: string, textBody: string) {
  const oauth2Client = await getOAuth2Client();
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // Create the email with proper headers to avoid threading issues
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@investbot.local>`;
  const messageParts = [
    `From: ${to}`,
    `To: ${to}`,
    `Subject: ${utf8Subject}`,
    `Message-ID: ${messageId}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="boundary"',
    '',
    '--boundary',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    textBody,
    '',
    '--boundary',
    'Content-Type: text/html; charset="UTF-8"',
    '',
    htmlBody,
    '',
    '--boundary--',
  ];

  const message = messageParts.join('\n');
  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // Retry configuration
  const MAX_RETRIES = 5;
  const BASE_DELAY_MS = 5000; // Start with 5 seconds
  const MAX_DELAY_MS = 300000; // Max 5 minutes

  let lastError: any;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
        },
      });

      console.log('✓ Email sent successfully!');
      console.log('  Message ID:', response.data.id);
      return response.data;
    } catch (error: any) {
      lastError = error;

      if (isRetryableError(error)) {
        // On auth errors, force a token refresh before retrying
        if (isAuthError(error)) {
          console.log(`🔑 Auth error (token expired). Refreshing token before retry ${attempt}/${MAX_RETRIES}...`);
          try {
            const { credentials } = await oauth2Client.refreshAccessToken();
            oauth2Client.setCredentials(credentials);
            // Persist the refreshed token
            const existing = existsSync(TOKEN_PATH) ? JSON.parse(readFileSync(TOKEN_PATH, 'utf-8')) : {};
            const saved = { ...existing, ...credentials };
            if (!saved.refresh_token && existing.refresh_token) saved.refresh_token = existing.refresh_token;
            writeFileSync(TOKEN_PATH, JSON.stringify(saved));
            console.log('Token refreshed successfully, retrying send...');
          } catch (refreshErr: any) {
            console.error('Token refresh failed:', refreshErr.message);
          }
          await sleep(2000);
          continue;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS);

        if (isRateLimitError(error)) {
          console.log(`⏳ Rate limit hit. Waiting ${Math.round(delay / 1000)}s before retry ${attempt}/${MAX_RETRIES}...`);
        } else {
          console.log(`⚠️ Transient error. Waiting ${Math.round(delay / 1000)}s before retry ${attempt}/${MAX_RETRIES}...`);
        }

        await sleep(delay);
        continue;
      }

      // Non-retryable error, throw immediately
      console.error('Error sending email:', error);
      throw error;
    }
  }

  // All retries exhausted
  console.error(`Failed to send email after ${MAX_RETRIES} attempts`);
  throw lastError;
}

// Get the authenticated user's email address
export async function getMyEmail(): Promise<string> {
  const oauth2Client = await getOAuth2Client();
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const profile = await gmail.users.getProfile({ userId: 'me' });
  return profile.data.emailAddress || '';
}
