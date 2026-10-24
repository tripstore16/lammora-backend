const express = require("express");
const router = express.Router();
const crypto = require("crypto");

const { requireAdminApi } = require("../middleware/auth.middleware");
const { cameraTokenLimiter } = require("../middleware/rateLimit.middleware");
const { signCameraToken } = require("../utils/jwt");
const firebase = require("../services/firebase.service");
const realtime = require("../services/realtime.service");

router.post("/token", cameraTokenLimiter, async (req, res) => {
  try {
    const sessionId = crypto.randomBytes(16).toString("hex");
    const token = signCameraToken(sessionId);
    return res.json({ success: true, token, sessionId });
  } catch (err) {
    return res.status(500).json({ success: false, error: "camera_token_failed" });
  }
});

router.get("/status", requireAdminApi, async (req, res) => {
  try {
    return res.json({
      success: true,
      online: realtime.isCameraOnline(),
      captureLocked: realtime.isCaptureLocked(),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: "status_failed" });
  }
});

router.get("/sessions", requireAdminApi, async (req, res) => {
  try {
    const db = firebase.getDb();
    const snap = await db
      .collection(firebase.getCollections().sessions)
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();

    const sessions = [];
    snap.forEach((doc) => {
      sessions.push(
        firebase.toSerializable(Object.assign({ id: doc.id }, doc.data()))
      );
    });

    return res.json({ success: true, sessions });
  } catch (err) {
    return res.status(500).json({ success: false, error: "sessions_lookup_failed" });
  }
});

module.exports = router;
