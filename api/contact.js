// Serverless function to send contact form emails via Resend
// Expects POST JSON: { name, email, interest, availability, message, honeypot }
// Env vars required on Vercel:
// - RESEND_API_KEY: your Resend API key
// - CONTACT_TO: destination inbox (comma-separated allowed)
// - CONTACT_FROM: verified sender email (e.g., "PeerFit <hello@yourdomain.com>")

/**
 * Vercel Node.js Serverless Function
 * - Method: POST
 * - Path: /api/contact
 */

const RESEND_API_URL = 'https://api.resend.com/emails';

// Simple HTML escape to guard against accidental HTML injection in the email body
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isValidEmail(email = '') {
  // Basic RFC 5322-ish email check
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body; // In some environments it may be pre-parsed
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw || '{}');
  } catch (_) {
    return {};
  }
}

function badRequest(res, message, details) {
  res.statusCode = 400;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: false, error: message, details }));
}

function serverError(res, message, details) {
  res.statusCode = 500;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: false, error: message, details }));
}

module.exports = async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return badRequest(res, 'Method not allowed');
  }

  const {
    RESEND_API_KEY,
    CONTACT_TO,
    CONTACT_FROM,
    CONTACT_BRAND_NAME,
    CONTACT_LOGO_URL,
    CONTACT_BRAND_PRIMARY,
    CONTACT_BRAND_ACCENT,
    CONTACT_APP_LINK,
  } = process.env;

  if (!RESEND_API_KEY) return serverError(res, 'Missing RESEND_API_KEY');
  if (!CONTACT_TO) return serverError(res, 'Missing CONTACT_TO');
  if (!CONTACT_FROM) return serverError(res, 'Missing CONTACT_FROM');

  const payload = await parseJsonBody(req);
  const { name, email, interest, availability, message, honeypot } = payload || {};

  // Honeypot: silently succeed to avoid tipping off bots
  if (honeypot) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true, spam: true }));
  }

  if (!name || typeof name !== 'string') return badRequest(res, 'Name is required');
  if (!email || !isValidEmail(email)) return badRequest(res, 'Valid email is required');
  if (!message || typeof message !== 'string') return badRequest(res, 'Message is required');

  const toList = String(CONTACT_TO)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const brand = {
    name: CONTACT_BRAND_NAME || 'PeerFit',
    logo: CONTACT_LOGO_URL || '',
    primary: CONTACT_BRAND_PRIMARY || '#0b0f19',
    accent: CONTACT_BRAND_ACCENT || '#ed933aff',
    appLink: CONTACT_APP_LINK || '',
  };

  const subject = `New App Access Request • ${name}`;

  const safe = {
    name: escapeHtml(name),
    email: escapeHtml(email),
    interest: escapeHtml(interest || ''),
    availability: escapeHtml(availability || ''),
    message: escapeHtml(message),
  };

  const mailSubject = encodeURIComponent(`${brand.name} App Link`);
  const mailBody = encodeURIComponent(`Hi ${name},\n\nThanks for your interest in ${brand.name}! Here is the download/access link:\n${brand.appLink || '<paste_link_here>'}\n\nIf you have any questions, just reply to this email.\n\n— ${brand.name} Team`);
  const replyCtaHref = `mailto:${encodeURIComponent(email)}?subject=${mailSubject}&body=${mailBody}`;

  const html = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f7fb;margin:0;padding:24px 0;">
      <tr>
        <td align="center" style="padding:0 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 8px 24px rgba(0,0,0,0.08);">
            <tr>
              <td style="background: linear-gradient(135deg, ${brand.accent}, #0ea5e9); padding:24px 24px 20px 24px; text-align:left;">
                ${brand.logo
                  ? `<img src="${brand.logo}" alt="${escapeHtml(brand.name)}" style="height:32px; display:block;" />`
                  : `<div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-weight:700; font-size:20px; color:#ffffff;">${escapeHtml(brand.name)}</div>`}
                <div style="height:8px"></div>
                <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color:#eaf2ff; opacity:0.95; font-size:14px;">New app access request</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 24px 8px 24px; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color:#111827;">
                <h2 style="margin:0 0 12px; font-size:20px; line-height:1.3; color:${brand.primary};">Action required: Send the app link</h2>
                <p style="margin:0 0 16px; color:#374151;">A new person submitted the contact form. Please send them the ${escapeHtml(brand.name)} app access link.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; background:#f9fafb; border:1px solid #eef2f7; border-radius:12px;">
                  <tr>
                    <td style="padding:16px;">
                      <p style="margin:0 0 6px;"><strong>Name</strong>: ${safe.name}</p>
                      <p style="margin:0 0 6px;"><strong>Email</strong>: <a href="mailto:${safe.email}" style="color:${brand.accent}; text-decoration:none;">${safe.email}</a></p>
                      ${safe.interest ? `<p style="margin:0 0 6px;"><strong>Interest</strong>: ${safe.interest}</p>` : ''}
                      ${safe.availability ? `<p style=\"margin:0 0 6px;\"><strong>Availability</strong>: ${safe.availability}</p>` : ''}
                    </td>
                  </tr>
                </table>
                <div style="height:16px"></div>
                <p style="margin:0 0 16px; color:#4b5563;">Message from ${safe.name}:</p>
                <blockquote style="margin:0; padding:12px 16px; background:#f9fafb; border-left:3px solid ${brand.accent}; color:#111827; white-space:pre-wrap; border-radius:4px;">${safe.message}</blockquote>
                <div style="height:20px"></div>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td>
                      <a href="${replyCtaHref}" style="display:inline-block; background:${brand.accent}; color:#ffffff; text-decoration:none; padding:12px 16px; border-radius:10px; font-weight:600; box-shadow:0 6px 14px rgba(124,58,237,0.3);">Reply with App Link</a>
                    </td>
                    ${brand.appLink ? `<td style="width:12px"></td><td><a href="${brand.appLink}" style="display:inline-block; background:#111827; color:#ffffff; text-decoration:none; padding:12px 16px; border-radius:10px; font-weight:600;">Open App Link</a></td>` : ''}
                  </tr>
                </table>
                <div style="height:8px"></div>
                <p style="margin:0; color:#6b7280; font-size:12px;">Tip: “Reply with App Link” opens your email client pre-filled to ${safe.email}.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 24px 24px;">
                <hr style="border:none; border-top:1px solid #eef2f7; margin:0 0 12px;" />
                <p style="margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color:#94a3b8; font-size:12px;">This notification was sent by ${escapeHtml(brand.name)}. You’re receiving it because you’re on the contact routing list.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const text =
    `New app access request\n` +
    `Brand: ${brand.name}\n` +
    `Name: ${name}\n` +
    `Email: ${email}\n` +
    (interest ? `Interest: ${interest}\n` : '') +
    (availability ? `Availability: ${availability}\n` : '') +
    `\nMessage from user:\n${message}\n\n` +
    `Action: Reply to the user with the app link.\n` +
    (brand.appLink ? `App link: ${brand.appLink}\n` : 'App link: <paste_link_here>\n') +
    `Suggested reply subject: ${brand.name} App Link\n` +
    `Suggested reply body:\nHi ${name},\n\nThanks for your interest in ${brand.name}! Here is the download/access link:\n${brand.appLink || '<paste_link_here>'}\n\nIf you have any questions, just reply to this email.\n\n— ${brand.name} Team`;

  try {
    const resp = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: CONTACT_FROM,
        to: toList,
        subject,
        html,
        text,
        reply_to: email,
      }),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      const info = typeof data === 'object' ? data : { body: String(data) };
      return serverError(res, 'Failed to send email via Resend', info);
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true, id: data && data.id }));
  } catch (err) {
    return serverError(res, 'Unexpected error while sending email', {
      message: err && err.message ? err.message : String(err),
    });
  }
};
