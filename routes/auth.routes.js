const express = require("express");
const router = express.Router();
const crypto = require("crypto");

const { verifyPassword } = require("../utils/password");
const {
  signAdminToken,
  setAdminCookie,
  clearAdminCookie,
  extractTokenFromRequest,
  verifyAdminToken,
} = require("../utils/jwt");
const { isUsername, isPasswordLike } = require("../utils/validation");
const { loginLimiter } = require("../middleware/rateLimit.middleware");
const { requireAdminApi } = require("../middleware/auth.middleware");

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!isUsername(username) || !isPasswordLike(password)) {
      return res.status(401).json({ success: false, error: "invalid_credentials" });
    }

    const adminUsername = process.env.ADMIN_USERNAME;
    const adminHash = process.env.ADMIN_PASSWORD_HASH;

    if (!adminUsername || !adminHash) {
      return res.status(500).json({ success: false, error: "server_misconfigured" });
    }

    let usernameMatches = false;
    try {
      const a = Buffer.from(String(username).trim());
      const b = Buffer.from(String(adminUsername).trim());
      usernameMatches = a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch (e) {
      usernameMatches = false;
    }

    if (!usernameMatches) {
      await verifyPassword(password, adminHash);
      return res.status(401).json({ success: false, error: "invalid_credentials" });
    }

    const passwordMatches = await verifyPassword(password, adminHash);
    if (!passwordMatches) {
      return res.status(401).json({ success: false, error: "invalid_credentials" });
    }

    const token = signAdminToken(String(adminUsername).trim());
    setAdminCookie(res, token);

    return res.json({
      success: true,
      admin: { username: String(adminUsername).trim() },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: "login_failed" });
  }
});

router.post("/logout", (req, res) => {
  clearAdminCookie(res);
  return res.json({ success: true });
});

router.get("/me", (req, res) => {
  const token = extractTokenFromRequest(req);
  const payload = token ? verifyAdminToken(token) : null;
  if (!payload) {
    return res.status(401).json({ success: false, authenticated: false });
  }
  return res.json({
    success: true,
    authenticated: true,
    admin: { username: payload.username },
  });
});

router.get("/socket-token", requireAdminApi, (req, res) => {
  try {
    const token = signAdminToken(req.admin.username);
    return res.json({ success: true, token });
  } catch (err) {
    return res.status(500).json({ success: false, error: "token_failed" });
  }
});

module.exports = router;
