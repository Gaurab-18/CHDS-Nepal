// SMTP end-to-end test : verifies Gmail auth + delivery.
// Run: npx ts-node --project tsconfig.test.json tests/scenarios/smtp-test.ts
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER || 'yanshkarki@gmail.com';
const SMTP_PASS = process.env.SMTP_PASS || '';
const FROM = process.env.SMTP_FROM || SMTP_USER;

async function main() {
  console.log(`Connecting to ${SMTP_HOST}:${SMTP_PORT} as ${SMTP_USER} …`);

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  // 1. Verify the connection / auth explicitly
  try {
    await transporter.verify();
    console.log('✓ SMTP verify() OK : server accepted credentials');
  } catch (err: any) {
    console.error('✗ SMTP verify() failed:', err.message);
    console.log('  Hint: App Password must be a 16-char Gmail app password.', err.code || '');
    process.exit(1);
  }

  // 2. Send a real message to the account itself
  const info = await transporter.sendMail({
    from: `CHDS Nepal <${FROM}>`,
    to: SMTP_USER,
    subject: 'CHDS SMTP Test : it works!',
    text: 'Hello! This email confirms Gmail SMTP is configured correctly on the CHDS backend.',
    html: '<p>Hello! This email confirms <b>Gmail SMTP</b> is configured correctly on the CHDS backend.</p><p>: CHDS Nepal</p>',
  });

  console.log('✓ Message sent:', info.messageId, info.accepted);
  await transporter.close();
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });