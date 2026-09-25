const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendAlertEmail(to, { url, failedChecks }) {
  const checkList = failedChecks.map((c) => `<li>${c}</li>`).join('');

  try {
    await resend.emails.send({
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
    console.error('Failed to send alert email:', err.message);
  }
}

module.exports = { sendAlertEmail };