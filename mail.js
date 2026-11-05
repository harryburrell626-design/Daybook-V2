// Password-reset email. Uses Resend's HTTP API if RESEND_API_KEY is set, otherwise logs to the console.
async function sendResetEmail(to, link) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`\n[mail:not-configured] Password reset link for ${to}:\n  ${link}\n`);
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || 'Daybook <noreply@example.com>',
      to: [to],
      subject: 'Reset your Daybook password',
      text: `Someone asked to reset the password for your Daybook account.\n\nOpen this link within one hour:\n${link}\n\nIf this wasn't you, you can ignore this email.`,
    }),
  });
  if (!res.ok) console.error('mail send failed', res.status);
  return res.ok;
}
module.exports = { sendResetEmail };
