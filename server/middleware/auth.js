/**
 * Authentication middleware
 * - Admin:   password-based auth with in-memory session tokens
 * - Advisor: JWT-based auth using jsonwebtoken
 */

const crypto = require('crypto');
const jwt    = require('jsonwebtoken');

// Session expiry time (24 hours)
const SESSION_EXPIRY_SECONDS = 24 * 60 * 60;

/**
 * Generate a secure random value (kept for compatibility)
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Validate admin password and create a JWT
 */
function login(password) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const jwtSecret     = process.env.JWT_SECRET;

  if (!adminPassword) {
    throw new Error('ADMIN_PASSWORD not configured');
  }
  if (!jwtSecret) {
    throw new Error('JWT_SECRET not configured');
  }

  if (password !== adminPassword) {
    return null;
  }

  const expiresAt = Date.now() + SESSION_EXPIRY_SECONDS * 1000;
  const token = jwt.sign(
    { role: 'admin', iat: Math.floor(Date.now() / 1000) },
    jwtSecret,
    { expiresIn: SESSION_EXPIRY_SECONDS }
  );

  return { token, expiresAt };
}

/**
 * Logout - JWT is stateless; client discards the token.
 * Kept for API compatibility.
 */
function logout(_token) {
  // no-op: JWT invalidation is handled client-side
}

/**
 * Validate a JWT admin token
 */
function validateToken(token) {
  if (!token) return false;

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) return false;

  try {
    const payload = jwt.verify(token, jwtSecret);
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

/**
 * Authentication middleware for protected routes
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      message: 'Please provide a valid admin token',
    });
  }
  
  const token = authHeader.split(' ')[1];
  
  if (!validateToken(token)) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
      message: 'Please login again',
    });
  }
  
  next();
}

module.exports = {
  login,
  logout,
  validateToken,
  authMiddleware,
  generateToken,
  advisorAuthMiddleware,
};

// ─── Advisor JWT helpers ────────────────────────────────────────────────────────

/**
 * Sign a JWT for an advisor (7-day expiry).
 * @param {Object} advisor - Mongoose document or plain object with _id and email
 */
function signAdvisorToken(advisor) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return jwt.sign(
    { id: advisor._id.toString(), email: advisor.email },
    secret,
    { expiresIn: '7d' }
  );
}

/**
 * Middleware: verify advisor JWT and attach req.advisor = { id, email }.
 */
function advisorAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error:   'Authentication required',
      message: 'Please provide a valid advisor token',
    });
  }

  const token  = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    console.error('[advisorAuthMiddleware] JWT_SECRET not configured');
    return res.status(500).json({ success: false, error: 'Server misconfiguration' });
  }

  try {
    const payload   = jwt.verify(token, secret);
    req.advisor     = { id: payload.id, email: payload.email };
    next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError'
      ? 'Token has expired — please login again'
      : 'Invalid token — please login again';
    return res.status(401).json({ success: false, error: message });
  }
}

module.exports.signAdvisorToken = signAdvisorToken;
