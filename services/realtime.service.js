const { verifyAdminToken, verifyCameraToken } = require("../utils/jwt");
const { isCaptureId, isCountdown } = require("../utils/validation");
const firebase = require("./firebase.service");
const crypto = require("crypto");

const ACTIVE_CAMERA_ROOM = "camera:active";
const ACTIVE_REMOTE_ROOM = "remote:active";

const state = {
  io: null,
  activeCameraSocketId: null,
  activeRemoteSocketId: null,
  activeCapture: null,
  captureLock: false,
};

function parseAuthFromHandshake(socket) {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (!token || typeof token !== "string") return null;

  const adminPayload = verifyAdminToken(token);
  if (adminPayload) {
    return { role: "admin", payload: adminPayload };
  }

  const cameraPayload = verifyCameraToken(token);
  if (cameraPayload) {
    return { role: "camera", payload: cameraPayload };
  }

  return null;
}

function generateCaptureId() {
  return crypto.randomBytes(16).toString("hex");
}

function getActiveCapture() {
  return state.activeCapture;
}

function isCaptureLocked() {
  return state.captureLock;
}

function beginCapture(payload) {
  if (state.captureLock) return null;
  const captureId = generateCaptureId();
  state.activeCapture = {
    captureId,
    countdown: payload.countdown,
    startedAt: Date.now(),
    requestedBy: payload.username || null,
    status: "pending",
  };
  state.captureLock = true;
  return state.activeCapture;
}

function completeCapture(captureId, status) {
  if (state.activeCapture && state.activeCapture.captureId === captureId) {
    state.activeCapture.status = status;
  }
  state.captureLock = false;
  state.activeCapture = null;
}

function setupRealtime(io) {
  state.io = io;

  io.use((socket, next) => {
    const auth = parseAuthFromHandshake(socket);
    if (!auth) {
      return next(new Error("unauthorized"));
    }
    socket.data.auth = auth;
    socket.data.role = auth.role;
    if (auth.role === "admin") {
      socket.data.admin = auth.payload;
    }
    next();
  });

  io.on("connection", (socket) => {
    socket.on("camera:register", async () => {
      if (socket.data.role !== "camera") return;

      state.activeCameraSocketId = socket.id;
      const sessionId = socket.data.auth.payload.sessionId || generateCaptureId();
      
      socket.data.sessionId = sessionId;
      socket.join(ACTIVE_CAMERA_ROOM);

      try {
        await firebase.createSessionRecord({
          sessionId,
          type: "camera",
          socketId: socket.id,
          startedAt: new Date().toISOString(),
          status: "active",
        });
      } catch (e) {}

      socket.emit("camera:registered", { sessionId });

      if (state.activeRemoteSocketId) {
        io.to(state.activeRemoteSocketId).emit("camera:online", { sessionId });
      }
    });

    socket.on("camera:online", () => {
      if (socket.data.role === "camera") {
        socket.join(ACTIVE_CAMERA_ROOM);
        if (state.activeRemoteSocketId) {
          io.to(state.activeRemoteSocketId).emit("camera:online", {
            sessionId: socket.data.sessionId || null,
          });
        }
      }
    });

    socket.on("camera:offline", () => {
      if (socket.data.role === "camera") {
        if (state.activeRemoteSocketId) {
          io.to(state.activeRemoteSocketId).emit("camera:offline", {});
        }
      }
    });

    socket.on("remote:register", () => {
      if (socket.data.role !== "admin") return;

      state.activeRemoteSocketId = socket.id;
      socket.join(ACTIVE_REMOTE_ROOM);

      if (state.activeCameraSocketId) {
        socket.emit("camera:online", { sessionId: state.activeCameraSocketId });
      }
    });

    socket.on("webrtc:offer", (payload) => {
      if (socket.data.role !== "admin") return;
      if (!state.activeCameraSocketId) return;
      const cameraSocket = io.sockets.sockets.get(state.activeCameraSocketId);
      if (!cameraSocket) return;
      cameraSocket.emit("webrtc:offer", { sdp: payload && payload.sdp });
      cameraSocket.emit("camera:paired", {});
    });

    socket.on("webrtc:answer", (payload) => {
      if (socket.data.role !== "camera") return;
      if (!state.activeRemoteSocketId) return;
      io.to(state.activeRemoteSocketId).emit("webrtc:answer", {
        sdp: payload && payload.sdp,
      });
    });

    socket.on("webrtc:ice-candidate", (payload) => {
      if (!payload || !payload.candidate) return;
      const role = payload.role;
      if (role === "remote" && state.activeCameraSocketId) {
        io.to(state.activeCameraSocketId).emit("webrtc:ice-candidate", {
          candidate: payload.candidate,
        });
      } else if (role === "camera" && state.activeRemoteSocketId) {
        io.to(state.activeRemoteSocketId).emit("webrtc:ice-candidate", {
          candidate: payload.candidate,
        });
      }
    });

    socket.on("capture:tick", (payload) => {
      if (socket.data.role !== "camera") return;
      if (!payload || !payload.captureId) return;
      if (state.activeRemoteSocketId) {
        io.to(state.activeRemoteSocketId).emit("capture:tick", {
          captureId: payload.captureId,
          remaining: payload.remaining,
        });
      }
    });

    socket.on("capture:rejected", (payload) => {
      if (socket.data.role !== "camera") return;
      if (!payload || !payload.captureId) return;
      completeCapture(payload.captureId, "rejected");
      if (state.activeRemoteSocketId) {
        io.to(state.activeRemoteSocketId).emit("capture:rejected", {
          captureId: payload.captureId,
          reason: payload.reason || "rejected",
        });
      }
    });

    socket.on("capture:completed", (payload) => {
      if (socket.data.role !== "camera") return;
      if (!payload || !isCaptureId(payload.captureId)) return;
      completeCapture(payload.captureId, "completed");
      if (state.activeRemoteSocketId) {
        io.to(state.activeRemoteSocketId).emit("capture:completed", {
          captureId: payload.captureId,
          photo: payload.photo || null,
        });
      }
    });

    socket.on("capture:failed", (payload) => {
      if (socket.data.role !== "camera") return;
      if (!payload || !payload.captureId) return;
      completeCapture(payload.captureId, "failed");
      if (state.activeRemoteSocketId) {
        io.to(state.activeRemoteSocketId).emit("capture:failed", {
          captureId: payload.captureId,
          reason: payload.reason || "unknown",
        });
      }
    });

    socket.on("disconnect", async () => {
      if (socket.id === state.activeCameraSocketId) {
        state.activeCameraSocketId = null;
        if (state.activeRemoteSocketId) {
          io.to(state.activeRemoteSocketId).emit("camera:offline", {});
        }
      }
      if (socket.id === state.activeRemoteSocketId) {
        state.activeRemoteSocketId = null;
      }
      if (state.activeCapture && state.activeCapture.status === "pending") {
        completeCapture(state.activeCapture.captureId, "failed");
      }
      try {
        if (socket.data.sessionId) {
          await firebase.updateSessionRecord(socket.data.sessionId, {
            status: "closed",
            closedAt: new Date().toISOString(),
          });
        }
      } catch (e) {}
    });
  });
}

function dispatchCapture(io, capturePayload) {
  if (!io) return { ok: false, reason: "no_io" };
  if (!state.activeCameraSocketId) return { ok: false, reason: "camera_offline" };
  if (state.captureLock) return { ok: false, reason: "capture_in_progress" };

  const countdown = Number(capturePayload.countdown);
  if (!isCountdown(countdown, 0, 60))
    return { ok: false, reason: "invalid_countdown" };

  const capture = beginCapture({ countdown, username: capturePayload.username });
  if (!capture) return { ok: false, reason: "capture_in_progress" };

  io.to(state.activeCameraSocketId).emit("capture:request", {
    captureId: capture.captureId,
    countdown,
  });

  firebase
    .createCaptureRecord({
      captureId: capture.captureId,
      countdown,
      status: "pending",
      requestedBy: capture.requestedBy,
    })
    .catch(() => {});

  return { ok: true, captureId: capture.captureId, countdown };
}

function isCameraOnline() {
  return Boolean(state.activeCameraSocketId);
}

module.exports = {
  setupRealtime,
  dispatchCapture,
  isCameraOnline,
  isCaptureLocked,
  getActiveCapture,
  ACTIVE_CAMERA_ROOM,
  ACTIVE_REMOTE_ROOM,
};
