const express = require("express");
const router = express.Router();

const { requireAdminApi } = require("../middleware/auth.middleware");
const firebase = require("../services/firebase.service");
const realtime = require("../services/realtime.service");
const { isNonEmptyString } = require("../utils/validation");

router.get("/current", requireAdminApi, async (req, res) => {
  try {
    const capture = realtime.getActiveCapture();
    return res.json({
      success: true,
      cameraOnline: realtime.isCameraOnline(),
      captureLocked: realtime.isCaptureLocked(),
      activeCapture: capture
        ? {
            captureId: capture.captureId,
            countdown: capture.countdown,
            status: capture.status,
            startedAt: capture.startedAt,
          }
        : null,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: "session_failed" });
  }
});

router.get("/:sessionId", requireAdminApi, async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!isNonEmptyString(sessionId, 64)) {
      return res.status(400).json({ success: false, error: "invalid_session_id" });
    }

    const record = await firebase.getSessionRecord(sessionId);
    if (!record) {
      return res.status(404).json({ success: false, error: "session_not_found" });
    }

    return res.json({
      success: true,
      session: firebase.toSerializable(record),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: "session_lookup_failed" });
  }
});

router.post("/:sessionId/revoke", requireAdminApi, async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!isNonEmptyString(sessionId, 64)) {
      return res.status(400).json({ success: false, error: "invalid_session_id" });
    }

    await firebase.updateSessionRecord(sessionId, {
      status: "revoked",
      revokedAt: new Date().toISOString(),
    });

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: "session_revoke_failed" });
  }
});

module.exports = router;
