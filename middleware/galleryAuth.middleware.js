const {
  verifyGalleryToken,
  extractGalleryTokenFromRequest,
} = require("../utils/jwt");

function requireGalleryApi(req, res, next) {
  const token = extractGalleryTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ success: false, error: "unauthorized" });
  }
  const payload = verifyGalleryToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, error: "unauthorized" });
  }
  req.gallery = { issuedAt: payload.iat };
  next();
}

function optionalGallery(req, res, next) {
  const token = extractGalleryTokenFromRequest(req);
  if (token) {
    const payload = verifyGalleryToken(token);
    if (payload) {
      req.gallery = { issuedAt: payload.iat };
    }
  }
  next();
}

module.exports = {
  requireGalleryApi,
  optionalGallery,
};
