const { verifyAdminToken, extractTokenFromRequest } = require("../utils/jwt");

function requireAdminApi(req, res, next) {
  const token = extractTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ success: false, error: "unauthorized" });
  }
  const payload = verifyAdminToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, error: "unauthorized" });
  }
  req.admin = { username: payload.username, issuedAt: payload.iat };
  next();
}

function requireAdminPage(req, res, next) {
  const token = extractTokenFromRequest(req);
  if (!token) {
    return res.redirect("/login");
  }
  const payload = verifyAdminToken(token);
  if (!payload) {
    return res.redirect("/login");
  }
  req.admin = { username: payload.username };
  next();
}

function optionalAdmin(req, res, next) {
  const token = extractTokenFromRequest(req);
  if (token) {
    const payload = verifyAdminToken(token);
    if (payload) {
      req.admin = { username: payload.username };
    }
  }
  next();
}

module.exports = {
  requireAdminApi,
  requireAdminPage,
  optionalAdmin,
};
