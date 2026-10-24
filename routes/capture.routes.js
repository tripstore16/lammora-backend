const express = require("express");
const router = express.Router();

const { requireAdminApi } = require("../middleware/auth.middleware");
const { captureLimiter } = require("../middleware/rateLimit.middleware");
const { isCountdown, isCaptureId } = require("../utils/validation");
const firebase = require("../services/firebase.service");
const realtime = require("../services/realtime.service");

router.post("/request", requireAdminApi, captureLimiter, async (req, res) => {
  try {
    const { countdown } = req.body || {};

    if (!isCountdown(countdown, 0, 60)) {
      return res.status(400).json({ success: false, error: "invalid_countdown" });
    }

    if (!realtime.isCameraOnline()) {
      return res.status(409).json({ success: false, error: "camera_offline" });
    }

    if (realtime.isCaptureLocked()) {
      return res.status(409).json({ success: false, error: "capture_in_progress" });
    }

    const io = req.app.get("io");
    if (!io) {
      return res.status(500).json({ success: false, error: "realtime_unavailable" });
    }

    const result = realtime.dispatchCapture(io, {
      countdown: Number(countdown),
      username: req.admin ? req.admin.username : null,
    });

    if (!result.ok) {
      if (result.reason === "capture_in_progress" || result.reason === "camera_offline") {
        return res.status(409).json({ success: false, error: result.reason });
      }
      return res.status(400).json({ success: false, error: result.reason });
    }

    return res.json({
      success: true,
      captureId: result.captureId,
      countdown: result.countdown,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: "capture_request_failed" });
  }
});

router.get("/status/:captureId", requireAdminApi, async (req, res) => {
  try {
    const { captureId } = req.params;
    if (!isCaptureId(captureId)) {
      return res.status(400).json({ success: false, error: "invalid_capture_id" });
    }

    const active = realtime.getActiveCapture();
    if (active && active.captureId === captureId) {
      return res.json({
        success: true,
        status: active.status,
        capture: {
          captureId: active.captureId,
          countdown: active.countdown,
          status: active.status,
          startedAt: active.startedAt,
        },
      });
    }

    const record = await firebase.getCaptureById(captureId);
    if (!record) {
      return res.status(404).json({ success: false, error: "capture_not_found" });
    }

    return res.json({
      success: true,
      status: record.status,
      capture: firebase.toSerializable(record),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: "capture_status_failed" });
  }
});

module.exports = router;
