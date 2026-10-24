const express = require("express");
const multer = require("multer");
const router = express.Router();

const { requireAdminApi } = require("../middleware/auth.middleware");
const { uploadLimiter } = require("../middleware/rateLimit.middleware");
const {
  isCaptureId,
  isPhotoId,
  isCursor,
  isLimit,
  normalizeLimit,
} = require("../utils/validation");
const firebase = require("../services/firebase.service");
const cloudinary = require("../services/cloudinary.service");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: cloudinary.MAX_UPLOAD_BYTES,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (!cloudinary.isAllowedMime(file.mimetype)) {
      return cb(new Error("invalid_file_type"));
    }
    return cb(null, true);
  },
});

router.post(
  "/upload",
  requireAdminApi,
  uploadLimiter,
  upload.single("photo"),
  async (req, res) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ success: false, error: "no_file" });
      }

      if (!cloudinary.isWithinSizeLimit(req.file.size)) {
        return res.status(413).json({ success: false, error: "file_too_large" });
      }

      const { captureId, sessionId } = req.body || {};

      if (captureId && !isCaptureId(captureId)) {
        return res.status(400).json({ success: false, error: "invalid_capture_id" });
      }

      const uploadResult = await cloudinary.uploadWithRetry(req.file.buffer, {
        captureId: captureId || null,
      });

      const metadata = cloudinary.extractMetadata(uploadResult);
      if (!metadata || !metadata.publicId || !metadata.secureUrl) {
        return res.status(502).json({ success: false, error: "upload_metadata_missing" });
      }

      const record = await firebase.createPhotoRecord({
        captureId: captureId || null,
        sessionId: sessionId || null,
        publicId: metadata.publicId,
        assetId: metadata.assetId,
        secureUrl: metadata.secureUrl,
        url: metadata.url,
        format: metadata.format,
        bytes: metadata.bytes,
        width: metadata.width,
        height: metadata.height,
        folder: metadata.folder,
        uploadedBy: req.admin ? req.admin.username : null,
      });

      const serialized = firebase.toSerializable(record);

      if (captureId) {
        try {
          await firebase.updateCaptureStatus(captureId, "completed", {
            photoId: record.id,
            photoUrl: metadata.secureUrl,
          });
        } catch (e) {}
      }

      return res.json({ success: true, photo: serialized });
    } catch (err) {
      if (err && err.message === "invalid_file_type") {
        return res.status(415).json({ success: false, error: "invalid_file_type" });
      }
      if (err && err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ success: false, error: "file_too_large" });
      }
      return res.status(500).json({ success: false, error: "upload_failed" });
    }
  }
);

router.get("/", requireAdminApi, async (req, res) => {
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

    const photos = result.items.map((photo) => firebase.toSerializable(photo));

    return res.json({
      success: true,
      photos,
      nextCursor: result.nextCursor,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: "photos_list_failed" });
  }
});

router.get("/:photoId", requireAdminApi, async (req, res) => {
  try {
    const { photoId } = req.params;
    if (!isPhotoId(photoId)) {
      return res.status(400).json({ success: false, error: "invalid_photo_id" });
    }

    const record = await firebase.getPhotoById(photoId);
    if (!record) {
      return res.status(404).json({ success: false, error: "photo_not_found" });
    }

    return res.json({
      success: true,
      photo: firebase.toSerializable(record),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: "photo_lookup_failed" });
  }
});

router.delete("/:photoId", requireAdminApi, async (req, res) => {
  try {
    const { photoId } = req.params;
    if (!isPhotoId(photoId)) {
      return res.status(400).json({ success: false, error: "invalid_photo_id" });
    }

    const record = await firebase.getPhotoById(photoId);
    if (!record) {
      return res.status(404).json({ success: false, error: "photo_not_found" });
    }

    if (!record.publicId) {
      return res.status(409).json({ success: false, error: "missing_public_id" });
    }

    try {
      await cloudinary.deleteWithRetry(record.publicId);
    } catch (e) {
      return res.status(502).json({ success: false, error: "cloudinary_delete_failed" });
    }

    await firebase.deletePhotoById(photoId);

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: "photo_delete_failed" });
  }
});

module.exports = router;
