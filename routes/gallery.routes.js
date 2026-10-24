const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const {
  optionalGallery,
  requireGalleryApi,
} = require("../middleware/galleryAuth.middleware");
const { galleryUnlockLimiter } = require("../middleware/rateLimit.middleware");
const {
  signGalleryToken,
  setGalleryCookie,
  clearGalleryCookie,
} = require("../utils/jwt");
const { isCursor, isLimit, normalizeLimit } = require("../utils/validation");
const firebase = require("../services/firebase.service");

router.get("/session", optionalGallery, (req, res) => {
  if (req.gallery) {
    return res.json({ success: true, unlocked: true });
  }
  return res.json({ success: true, unlocked: false });
});

router.post("/unlock", galleryUnlockLimiter, async (req, res) => {
  try {
    const { password } = req.body || {};

    if (
      typeof password !== "string" ||
      password.length === 0 ||
      password.length > 256
    ) {
      return res.status(401).json({ success: false, error: "invalid_password" });
    }

    const expected = process.env.PASSWORD_EVO;
    if (!expected) {
      return res.status(500).json({ success: false, error: "server_misconfigured" });
    }

    let matches = false;
    try {
      const a = Buffer.from(String(password));
      const b = Buffer.from(String(expected));
      matches = a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch (e) {
      matches = false;
    }

    if (!matches) {
      return res.status(401).json({ success: false, error: "invalid_password" });
    }

    const token = signGalleryToken();
    setGalleryCookie(res, token);

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: "unlock_failed" });
  }
});

router.post("/lock", (req, res) => {
  clearGalleryCookie(res);
  return res.json({ success: true });
});

router.get("/photos", requireGalleryApi, async (req, res) => {
  try {
    const { cursor, limit } = req.query || {};

    if (!isCursor(cursor)) {
      return res.status(400).json({ success: false, error: "invalid_cursor" });
    }
    if (!isLimit(limit, 24, 100)) {
      return res.status(400).json({ success: false, error: "invalid_limit" });
    }

    const effectiveLimit = normalizeLimit(limit, 24, 100);
    const result = await firebase.listPhotos({
      limit: effectiveLimit,
      cursor: cursor || null,
    });

    const photos = result.items.map((photo) => {
      const s = firebase.toSerializable(photo);
      return {
        id: s.id,
        secureUrl: s.secureUrl,
        width: s.width,
        height: s.height,
        createdAt: s.createdAt,
      };
    });

    return res.json({
      success: true,
      photos,
      nextCursor: result.nextCursor,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: "gallery_list_failed" });
  }
});

module.exports = router;
