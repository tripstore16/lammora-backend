const jwt = require("jsonwebtoken");
const cookie = require("cookie");

const ADMIN_COOKIE = "lammora_admin";
const GALLERY_COOKIE = "lammora_gallery";

const ADMIN_TTL = parseInt(process.env.SESSION_TTL_SECONDS, 10) || 8 * 60 * 60;
const GALLERY_TTL = parseInt(process.env.GALLERY_SESSION_TTL_SECONDS, 10) || 60 * 60;
const CAMERA_TTL = 60 * 60;

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET missing or too short");
  }
  return secret;
}

function signAdminToken(username) {
  return jwt.sign(
    { username, role: "admin" },
    getSecret(),
    { expiresIn: ADMIN_TTL, issuer: "lammora", audience: "admin" }
  );
}

function verifyAdminToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, getSecret(), {
      issuer: "lammora",
      audience: "admin",
    });
    if (!payload || payload.role !== "admin") return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function signCameraToken(sessionId) {
  return jwt.sign(
    { sessionId, role: "camera" },
    getSecret(),
    { expiresIn: CAMERA_TTL, issuer: "lammora", audience: "camera" }
  );
}

function verifyCameraToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, getSecret(), {
      issuer: "lammora",
      audience: "camera",
    });
    if (!payload || payload.role !== "camera") return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function signGalleryToken() {
  return jwt.sign(
    { role: "gallery" },
    getSecret(),
    { expiresIn: GALLERY_TTL, issuer: "lammora", audience: "gallery" }
  );
}

function verifyGalleryToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, getSecret(), {
      issuer: "lammora",
      audience: "gallery",
    });
    if (!payload || payload.role !== "gallery") return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function parseCookies(req) {
  if (req.cookies && typeof req.cookies === "object") {
    return req.cookies;
  }
  const header = req.headers && req.headers.cookie;
  if (!header) return {};
  try {
    return cookie.parse(header);
  } catch (e) {
    return {};
  }
}

function extractTokenFromRequest(req) {
  const cookies = parseCookies(req);
  return cookies[ADMIN_COOKIE] || null;
}

function extractGalleryTokenFromRequest(req) {
  const cookies = parseCookies(req);
  return cookies[GALLERY_COOKIE] || null;
}

function setAdminCookie(res, token) {
  res.cookie(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_TTL * 1000,
  });
}

function clearAdminCookie(res) {
  res.clearCookie(ADMIN_COOKIE, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
}

function setGalleryCookie(res, token) {
  res.cookie(GALLERY_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: GALLERY_TTL * 1000,
  });
}

function clearGalleryCookie(res) {
  res.clearCookie(GALLERY_COOKIE, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
}

module.exports = {
  ADMIN_COOKIE,
  GALLERY_COOKIE,
  signAdminToken,
  verifyAdminToken,
  signCameraToken,
  verifyCameraToken,
  signGalleryToken,
  verifyGalleryToken,
  extractTokenFromRequest,
  extractGalleryTokenFromRequest,
  setAdminCookie,
  clearAdminCookie,
  setGalleryCookie,
  clearGalleryCookie,
};
