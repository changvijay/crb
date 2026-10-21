/**
 * Auth API routes
 * GET  /api/auth/me                      — return current Auth0 session user
 * POST /api/auth/advisor/change-password — send Auth0 password reset email
 */
const express = require('express');
const axios   = require('axios');
const { requiresAuth } = require('express-openid-connect');
const User = require('../models/User');

const router = express.Router();

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
// Returns Auth0 user info for the current session (used by the auth widget).
// Returns 401 JSON (not a redirect) so the frontend can handle gracefully.
router.get('/me', (req, res) => {
  if (!req.oidc || !req.oidc.isAuthenticated()) {
    // Return 200 (not 401) — this is a status-check endpoint, not a protected resource.
    // 401 causes unnecessary browser console errors that confuse debugging.
    return res.status(200).json({ isAuthenticated: false });
  }
  const u = req.oidc.user;

  // Safety sync: keep MongoDB user profile in sync for already-authenticated sessions.
  User.findOneAndUpdate(
    { auth0Id: u.sub },
    {
      auth0Id: u.sub,
      email: (u.email || `${u.sub}@auth0.local`).toLowerCase().trim(),
      name: u.name || u.nickname || '',
      picture: u.picture || '',
      emailVerified: Boolean(u.email_verified),
      lastLogin: new Date(),
    },
    { upsert: true, new: true }
  ).catch((err) => {
    console.error('[Auth] /me DB sync failed:', err.message);
  });

  res.json({
    isAuthenticated: true,
    user: {
      sub:     u.sub,
      email:   u.email   || '',
      name:    u.name    || u.nickname || '',
      picture: u.picture || '',
    },
  });
});

// ── POST /api/auth/advisor/change-password ────────────────────────────────────
// Calls Auth0's dbconnections/change_password API to send a password-reset
// email to the currently logged-in user.  No Management API token required.
router.post('/advisor/change-password', requiresAuth(), async (req, res) => {
  const email = req.oidc.user?.email;
  if (!email) {
    return res.status(400).json({ success: false, error: 'No email found in session' });
  }

  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_CLIENT_ID;

  if (!domain || !clientId) {
    return res.status(500).json({ success: false, error: 'Auth0 not configured on server' });
  }

  try {
    await axios.post(`https://${domain}/dbconnections/change_password`, {
      client_id:  clientId,
      email,
      connection: 'Username-Password-Authentication',
    });
    res.json({
      success: true,
      message: 'Password reset email sent. Check your inbox and follow the link.',
    });
  } catch (err) {
    const status  = err.response?.status  || 500;
    const message = err.response?.data?.message || err.message || 'Failed to send reset email';
    console.error('[Auth] change-password error:', message);
    res.status(status).json({ success: false, error: message });
  }
});

module.exports = router;
