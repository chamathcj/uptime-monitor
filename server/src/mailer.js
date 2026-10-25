import nodemailer from 'nodemailer';

let transporterPromise;

async function createTransporter() {
  const mode = process.env.MAIL_MODE || 'console';

  if (mode === 'smtp') {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }

  if (mode === 'ethereal') {
    
    const account = await nodemailer.createTestAccount();
    return nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: { user: account.user, pass: account.pass },
    });
  }

  return null; 
}

function getTransporter() {
  if (!transporterPromise) transporterPromise = createTransporter();
  return transporterPromise;
}

export async function sendMail({ to, subject, text }) {
  if (process.env.MAIL_MODE === 'off') return;
  const transporter = await getTransporter();
  if (!transporter) {
    console.log(`[mail:console] To: ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }

  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM || 'Uptime Monitor <alerts@example.com>',
    to,
    subject,
    text,
  });

  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) console.log(`Email preview: ${preview}`);
}