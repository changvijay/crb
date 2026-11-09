/**
 * emailService.js — Bulk recommendation email notifications
 *
 * Architecture for up to 1,00,000 users:
 *  • MongoDB cursor: streams users in pages of CURSOR_PAGE_SIZE to avoid
 *    loading the entire collection into memory at once.
 *  • Connection pooling: one persistent SMTP pool is reused across all batches.
 *  • Rate limiting: nodemailer's built-in rateLimit caps sends per second so
 *    you never exceed Gmail's SMTP throughput window.
 *  • Fire-and-forget: the route responds immediately; email dispatch runs in
 *    the background via a detached async task.
 *  • Per-batch error isolation: a failure in one batch never aborts the rest.
 *
 * Gmail SMTP limits (plan accordingly):
 *  ┌─────────────────────────────────┬──────────────┐
 *  │ Account type                    │ Daily limit  │
 *  ├─────────────────────────────────┼──────────────┤
 *  │ Free Gmail (@gmail.com)         │    500 / day │
 *  │ Google Workspace (standard)     │  2,000 / day │
 *  │ Workspace + SMTP relay          │ 10,000 / day │
 *  └─────────────────────────────────┴──────────────┘
 *  For production at 1L users use Gmail SMTP Relay (Workspace) or
 *  migrate to Amazon SES / SendGrid (swap the transporter only).
 *
 * Required .env variables:
 *   GMAIL_USER          — sender address e.g. alerts@yourworkspace.com
 *   GMAIL_APP_PASSWORD  — 16-char App Password (Google Account → Security)
 *   SITE_URL            — base URL for links e.g. https://changresearchbase.com
 *   EMAIL_BATCH_SIZE    — emails per flush (default 50)
 *   EMAIL_BATCH_DELAY   — ms pause between batches (default 1200)
 *   EMAIL_RATE_LIMIT    — max emails per rateDelta window (default 14)
 *   EMAIL_RATE_DELTA    — window in ms for rate limit (default 1000)
 */

'use strict';

const nodemailer   = require('nodemailer');
const User         = require('../models/User');

// ─── Config (from env with safe defaults) ────────────────────────────────────
const GMAIL_USER        = process.env.GMAIL_USER;
const GMAIL_APP_PASS    = process.env.GMAIL_APP_PASSWORD;
const SITE_URL          = (process.env.SITE_URL || 'https://changresearchbase.vercel.app').replace(/\/$/, '');
const BATCH_SIZE        = Math.max(1,  parseInt(process.env.EMAIL_BATCH_SIZE   || '50',   10));
const BATCH_DELAY_MS    = Math.max(0,  parseInt(process.env.EMAIL_BATCH_DELAY  || '1200', 10));
const RATE_LIMIT        = Math.max(1,  parseInt(process.env.EMAIL_RATE_LIMIT   || '14',   10));
const RATE_DELTA        = Math.max(100,parseInt(process.env.EMAIL_RATE_DELTA   || '1000', 10));
const CURSOR_PAGE_SIZE  = 500;   // how many User docs to hydrate at a time

// ─── Transporter factory ──────────────────────────────────────────────────────
// Created once per bulk-send job, closed when done.
function createTransporter() {
  if (!GMAIL_USER || !GMAIL_APP_PASS) {
    throw new Error('[EmailService] GMAIL_USER and GMAIL_APP_PASSWORD must be set in .env');
  }
  return nodemailer.createTransport({
    host:   'smtp.gmail.com',
    port:   587,
    secure: false,           // STARTTLS on port 587
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASS,
    },
    pool:           true,    // reuse TCP connections
    maxConnections: 5,       // parallel SMTP connections
    maxMessages:    100,     // messages per connection before recycling
    rateLimit:      RATE_LIMIT,
    rateDelta:      RATE_DELTA,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const TERM_LABELS = {
  SHORT_TERM:  'Short Term',
  MEDIUM_TERM: 'Medium Term',
  LONG_TERM:   'Long Term',
  INTRADAY:    'Intraday',
};

const STATUS_COLOR = {
  BUY:  '#16a34a',   // green
  SELL: '#dc2626',   // red
};

// ─── HTML email template ──────────────────────────────────────────────────────
function buildEmailHtml(reco, advisor) {
  const advisorName   = advisor?.displayName || reco.addedBy?.name || 'An Advisor';
  const tradeColor    = STATUS_COLOR[reco.tradeType] || '#2563eb';
  const termLabel     = TERM_LABELS[reco.term] || reco.term;
  const recoPageUrl   = `${SITE_URL}/recommendations`;
  const unsubUrl      = `${SITE_URL}/account`; // user manages notifications here

  const formattedDate = new Date().toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>New Trade Recommendation — ${reco.symbol}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <!-- Preview text (hidden) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    New ${reco.tradeType} on ${reco.symbol} • Entry ₹${reco.entryPrice} • Target ₹${reco.exitPrice} • ${reco.upsidePotential}% upside ‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌
  </div>

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;padding:24px 0;">
    <tr>
      <td align="center">

        <!-- Outer card -->
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;
                      box-shadow:0 4px 24px rgba(15,23,42,0.10);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);
                       padding:28px 32px 24px;text-align:center;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:2px;
                         color:rgba(255,255,255,0.7);text-transform:uppercase;">
                Chang Research Base
              </p>
              <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;line-height:1.3;">
                New Trade Recommendation
              </h1>
              <p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">
                ${formattedDate} &nbsp;•&nbsp; Posted by ${advisorName}
              </p>
            </td>
          </tr>

          <!-- Symbol + badge -->
          <tr>
            <td style="padding:28px 32px 8px;text-align:center;">
              <p style="margin:0 0 12px;font-size:13px;font-weight:500;color:#64748b;text-transform:uppercase;letter-spacing:1px;">
                ${termLabel}
              </p>
              <h2 style="margin:0;font-size:38px;font-weight:900;color:#0f172a;letter-spacing:-1px;">
                ${reco.symbol}
              </h2>
              <div style="display:inline-block;margin-top:10px;padding:5px 18px;
                          background:${tradeColor};border-radius:20px;">
                <span style="font-size:13px;font-weight:700;color:#ffffff;letter-spacing:1px;">
                  ${reco.tradeType}
                </span>
              </div>
            </td>
          </tr>

          <!-- Key metrics table -->
          <tr>
            <td style="padding:20px 32px 4px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <!-- Entry -->
                  <td width="25%" style="padding:0 6px 0 0;text-align:center;">
                    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 8px;">
                      <p style="margin:0 0 4px;font-size:10px;font-weight:600;color:#94a3b8;
                                 text-transform:uppercase;letter-spacing:0.8px;">Entry</p>
                      <p style="margin:0;font-size:18px;font-weight:800;color:#0f172a;">₹${reco.entryPrice}</p>
                    </div>
                  </td>
                  <!-- Target -->
                  <td width="25%" style="padding:0 6px;text-align:center;">
                    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 8px;">
                      <p style="margin:0 0 4px;font-size:10px;font-weight:600;color:#16a34a;
                                 text-transform:uppercase;letter-spacing:0.8px;">Target</p>
                      <p style="margin:0;font-size:18px;font-weight:800;color:#15803d;">₹${reco.exitPrice}</p>
                    </div>
                  </td>
                  <!-- Stop Loss -->
                  <td width="25%" style="padding:0 6px;text-align:center;">
                    <div style="background:#fff7f7;border:1px solid #fecaca;border-radius:10px;padding:14px 8px;">
                      <p style="margin:0 0 4px;font-size:10px;font-weight:600;color:#dc2626;
                                 text-transform:uppercase;letter-spacing:0.8px;">Stop Loss</p>
                      <p style="margin:0;font-size:18px;font-weight:800;color:#dc2626;">₹${reco.stopLoss}</p>
                    </div>
                  </td>
                  <!-- Upside -->
                  <td width="25%" style="padding:0 0 0 6px;text-align:center;">
                    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 8px;">
                      <p style="margin:0 0 4px;font-size:10px;font-weight:600;color:#2563eb;
                                 text-transform:uppercase;letter-spacing:0.8px;">Upside</p>
                      <p style="margin:0;font-size:18px;font-weight:800;color:#1d4ed8;">+${reco.upsidePotential}%</p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Reason -->
          <tr>
            <td style="padding:20px 32px 8px;">
              <div style="background:#f8fafc;border-left:4px solid #2563eb;
                          border-radius:0 8px 8px 0;padding:14px 16px;">
                <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#64748b;
                           text-transform:uppercase;letter-spacing:0.8px;">Analysis / Reason</p>
                <p style="margin:0;font-size:14px;color:#334155;line-height:1.6;">
                  ${reco.reason}
                </p>
              </div>
            </td>
          </tr>

          ${reco.reference ? `
          <!-- Reference -->
          <tr>
            <td style="padding:4px 32px 8px;">
              <p style="margin:0;font-size:12px;color:#64748b;">
                Reference:
                <a href="${reco.reference}" style="color:#2563eb;text-decoration:none;"
                   target="_blank" rel="noopener">${reco.reference}</a>
              </p>
            </td>
          </tr>` : ''}

          <!-- Disclaimer -->
          <tr>
            <td style="padding:12px 32px 8px;">
              <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;">
                <p style="margin:0;font-size:11px;color:#92400e;line-height:1.5;">
                  ⚠️ <strong>Disclaimer:</strong> This is not SEBI-registered investment advice.
                  Trade recommendations are for educational purposes only. Always do your own
                  research and consult a certified financial advisor before investing.
                </p>
              </div>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:20px 32px;text-align:center;">
              <a href="${recoPageUrl}"
                 style="display:inline-block;padding:13px 32px;background:#2563eb;color:#ffffff;
                        font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;
                        letter-spacing:0.3px;">
                View All Recommendations →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;
                       padding:20px 32px;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#1e293b;">
                Chang Research Base
              </p>
              <p style="margin:0 0 12px;font-size:11px;color:#94a3b8;line-height:1.5;">
                You're receiving this because you're a registered member.<br/>
                To stop receiving trade alerts, update your notification preferences.
              </p>
              <a href="${unsubUrl}"
                 style="font-size:11px;color:#94a3b8;text-decoration:underline;">
                Manage Notifications
              </a>
              &nbsp;&nbsp;|&nbsp;&nbsp;
              <a href="${SITE_URL}"
                 style="font-size:11px;color:#94a3b8;text-decoration:underline;">
                Visit Website
              </a>
            </td>
          </tr>

        </table>
        <!-- /Outer card -->

      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Plain-text fallback ───────────────────────────────────────────────────────
function buildEmailText(reco, advisor) {
  const advisorName = advisor?.displayName || reco.addedBy?.name || 'An Advisor';
  return `
New Trade Recommendation — ${reco.symbol}
Posted by: ${advisorName}

Trade Type : ${reco.tradeType}
Term       : ${TERM_LABELS[reco.term] || reco.term}
Entry      : ₹${reco.entryPrice}
Target     : ₹${reco.exitPrice}
Stop Loss  : ₹${reco.stopLoss}
Upside     : +${reco.upsidePotential}%

Reason:
${reco.reason}

${reco.reference ? `Reference: ${reco.reference}\n` : ''}
View recommendations: ${SITE_URL}/recommendations

--
Chang Research Base
Disclaimer: Not SEBI-registered investment advice. For educational purposes only.
Manage notifications: ${SITE_URL}/account
  `.trim();
}

// ─── Send a single batch of users ─────────────────────────────────────────────
async function sendBatch(transporter, users, mailOptions) {
  let sent = 0;
  let failed = 0;

  await Promise.allSettled(
    users.map(user =>
      transporter.sendMail({
        ...mailOptions,
        to:   user.email,
        // personalised greeting in the Reply-To header for deliverability
      }).then(() => { sent++; })
        .catch(err => {
          failed++;
          // Log individual failures at debug level — don't pollute prod logs
          console.warn(`[EmailService] Failed to send to ${user.email}: ${err.message}`);
        })
    )
  );

  return { sent, failed };
}

// ─── Main: broadcast new recommendation to all verified users ─────────────────
/**
 * Dispatches email notifications to all users with a verified email.
 * This function is FIRE-AND-FORGET — call it without await from the route.
 *
 * @param {Object} reco    — saved TradeRecommendation document
 * @param {Object} advisor — Advisor document (or null)
 */
async function broadcastRecommendationEmail(reco, advisor) {
  const jobId = `reco-${reco._id}`;

  // Guard: ensure credentials are present before starting
  if (!GMAIL_USER || !GMAIL_APP_PASS) {
    console.error('[EmailService] Aborting: GMAIL_USER / GMAIL_APP_PASSWORD not set in .env');
    return;
  }

  // Resolve advisor details if only an ID was passed
  let advisorDoc = advisor;
  if (!advisorDoc && reco.addedBy?.userId) {
    try {
      const Advisor = require('../models/Advisor');
      advisorDoc = await Advisor.findById(reco.addedBy.userId).select('displayName advisorType').lean();
    } catch (_) { /* non-critical */ }
  }

  const htmlBody = buildEmailHtml(reco, advisorDoc);
  const textBody = buildEmailText(reco, advisorDoc);
  const advisorName = advisorDoc?.displayName || reco.addedBy?.name || 'An Advisor';

  const baseMailOptions = {
    from:    `"Chang Research Base" <${GMAIL_USER}>`,
    subject: `📊 New ${reco.tradeType}: ${reco.symbol} | ${reco.upsidePotential}% Upside — Chang Research Base`,
    html:    htmlBody,
    text:    textBody,
    headers: {
      // Help ESPs classify as transactional (improves deliverability)
      'X-Entity-Ref-ID':     jobId,
      'List-Unsubscribe':    `<${SITE_URL}/account>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };

  const transporter = createTransporter();

  let totalSent    = 0;
  let totalFailed  = 0;
  let totalSkipped = 0;
  let batchNum     = 0;
  let userBatch    = [];

  try {
    // Cursor-based iteration — never loads more than CURSOR_PAGE_SIZE docs at once
    const cursor = User.find({
        emailVerified: true,
        'emailNotifications.recommendations': { $ne: false }, // respect opt-out
      })
      .select('email')
      .lean()
      .cursor({ batchSize: CURSOR_PAGE_SIZE });

    for await (const user of cursor) {
      if (!user.email) { totalSkipped++; continue; }

      userBatch.push(user);

      if (userBatch.length >= BATCH_SIZE) {
        batchNum++;
        const result = await sendBatch(transporter, userBatch, baseMailOptions);
        totalSent   += result.sent;
        totalFailed += result.failed;
        userBatch    = [];

        // Polite delay between batches to respect SMTP server throttle
        if (BATCH_DELAY_MS > 0) await delay(BATCH_DELAY_MS);
      }
    }

    // Flush the last partial batch
    if (userBatch.length > 0) {
      batchNum++;
      const result = await sendBatch(transporter, userBatch, baseMailOptions);
      totalSent   += result.sent;
      totalFailed += result.failed;
    }

  } catch (err) {
    console.error(`[EmailService] [${jobId}] Fatal error during broadcast: ${err.message}`);
  } finally {
    transporter.close();
    
  }
}

function buildWeeklyDigestHtml(recos) {
  if (!recos || recos.length === 0) {
    return '<p>No new trade recommendations available this week.</p>';
  }

  const rows = recos.map((reco, idx) => {
    const termLabel = TERM_LABELS[reco.term] || reco.term;
    const tradeColor = STATUS_COLOR[reco.tradeType] || '#2563eb';
    return `
      <tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:16px 0;vertical-align:top;">
          <strong style="font-size:15px;color:#0f172a;">${idx + 1}. ${reco.symbol}</strong>
          <div style="margin-top:8px;font-size:13px;color:#475569;line-height:1.6;">
            <div><strong>Type:</strong> ${reco.tradeType}</div>
            <div><strong>Term:</strong> ${termLabel}</div>
            <div><strong>Entry:</strong> ₹${reco.entryPrice} · <strong>Target:</strong> ₹${reco.exitPrice} · <strong>Stop Loss:</strong> ₹${reco.stopLoss}</div>
            <div><strong>Upside:</strong> +${reco.upsidePotential}%</div>
            <div><strong>Reason:</strong> ${reco.reason}</div>
            ${reco.reference ? `<div><strong>Reference:</strong> <a href="${reco.reference}" style="color:#2563eb;text-decoration:none;">${reco.reference}</a></div>` : ''}
          </div>
        </td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Weekly Trade Recommendation Digest</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.10);">
          <tr>
            <td style="background:#1e3a5f;padding:28px 32px;text-align:center;color:#ffffff;">
              <h1 style="margin:0;font-size:24px;line-height:1.2;">Weekly Trade Recommendation Digest</h1>
              <p style="margin:10px 0 0;font-size:14px;color:#dbeafe;">Here are the latest trade recommendations added since the last email.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${rows}
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;text-align:center;color:#64748b;font-size:12px;line-height:1.5;">
              You're receiving this email because you're a registered member of Chang Research Base.<br />
              Update your notification preferences in your account if you no longer wish to receive weekly digests.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildWeeklyDigestText(recos) {
  if (!recos || recos.length === 0) {
    return 'No new trade recommendations are available this week.';
  }

  const lines = recos.map((reco, idx) => {
    return `${idx + 1}. ${reco.symbol} (${reco.tradeType})\n` +
      `Term: ${TERM_LABELS[reco.term] || reco.term}\n` +
      `Entry: ₹${reco.entryPrice} · Target: ₹${reco.exitPrice} · Stop Loss: ₹${reco.stopLoss}\n` +
      `Upside: +${reco.upsidePotential}%\n` +
      `Reason: ${reco.reason}\n` +
      `${reco.reference ? `Reference: ${reco.reference}\n` : ''}`;
  });

  return [`Weekly Trade Recommendation Digest`, ``, ...lines, ``, `Visit ${SITE_URL}/recommendations for the full list of recommendations.`, ``, `Chang Research Base`, `Disclaimer: Not SEBI-registered investment advice. For educational purposes only.`, `Manage notifications: ${SITE_URL}/account`].join('\n');
}

async function sendWeeklyUnsentRecommendations(options = {}) {
  const TradeRecommendation = require('../models/TradeRecommendation');
  const summary = { toSend: 0, sent: 0, failed: 0, errors: [] };

  const unsent = await TradeRecommendation.find({ emailSent: { $ne: true } }).lean();
  summary.toSend = unsent.length;
  if (unsent.length === 0) return summary;

  const htmlBody = buildWeeklyDigestHtml(unsent);
  const textBody = buildWeeklyDigestText(unsent);
  const baseMailOptions = {
    from:    `"Chang Research Base" <${GMAIL_USER}>`,
    subject: `📬 Weekly Trade Recommendation Digest — ${unsent.length} new recommendation${unsent.length === 1 ? '' : 's'}`,
    html:    htmlBody,
    text:    textBody,
    headers: {
      'List-Unsubscribe': `<${SITE_URL}/account>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };

  const transporter = createTransporter();
  let totalSent = 0;
  let totalFailed = 0;
  let batchNum = 0;
  let userBatch = [];

  try {
    const cursor = User.find({
        emailVerified: true,
        'emailNotifications.recommendations': { $ne: false },
      })
      .select('email')
      .lean()
      .cursor({ batchSize: CURSOR_PAGE_SIZE });

    for await (const user of cursor) {
      if (!user.email) continue;
      userBatch.push(user);

      if (userBatch.length >= BATCH_SIZE) {
        batchNum++;
        const result = await sendBatch(transporter, userBatch, baseMailOptions);
        totalSent  += result.sent;
        totalFailed += result.failed;
        userBatch = [];
        if (BATCH_DELAY_MS > 0) await delay(BATCH_DELAY_MS);
      }
    }

    if (userBatch.length > 0) {
      batchNum++;
      const result = await sendBatch(transporter, userBatch, baseMailOptions);
      totalSent  += result.sent;
      totalFailed += result.failed;
    }

    if (totalFailed === 0) {
      await TradeRecommendation.updateMany(
        { _id: { $in: unsent.map(r => r._id) } },
        { $set: { emailSent: true } }
      );
      summary.sent = totalSent;
    } else {
      summary.failed = totalFailed;
      summary.errors.push({ message: 'Some emails failed to deliver. Recommendations were not marked as sent.' });
    }

    summary.sent = totalSent;
    summary.failed = totalFailed;

  } catch (err) {
    console.error('[EmailService] Weekly digest send failed:', err.message);
    summary.failed = totalFailed + 1;
    summary.errors.push({ message: err.message });
  } finally {
    transporter.close();
  }

  return summary;
}

module.exports = { broadcastRecommendationEmail, sendWeeklyUnsentRecommendations };
