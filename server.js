require("dotenv").config();

const path = require("path");
const http = require("http");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { Server } = require("socket.io");

const { initFirebase } = require("./services/firebase.service");
const { initCloudinary } = require("./services/cloudinary.service");
const { setupRealtime } = require("./services/realtime.service");

const authRoutes = require("./routes/auth.routes");
const cameraRoutes = require("./routes/camera.routes");
const photosRoutes = require("./routes/photos.routes");
const sessionRoutes = require("./routes/session.routes");
const galleryRoutes = require("./routes/gallery.routes");
const captureRoutes = require("./routes/capture.routes");

const { attachCsrf } = require("./middleware/csrf.middleware");
const { requireAdminPage } = require("./middleware/auth.middleware");
const { globalLimiter } = require("./middleware/rateLimit.middleware");
const { errorHandler, notFoundHandler } = require("./middleware/error.middleware");

const app = express();
const server = http.createServer(app);

const PORT = parseInt(process.env.PORT, 10) || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";
const FRONTEND_URL = process.env.FRONTEND_URL || "https://lammora.vercel.app";

initFirebase();
initCloudinary();

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://res.cloudinary.com",
          "https://*.cloudinary.com",
        ],
        mediaSrc: ["'self'", "blob:"],
        connectSrc: [
          "'self'",
          "ws:",
          "wss:",
          "https://lammora-backend.up.railway.app",
          "https://res.cloudinary.com",
          "https://*.cloudinary.com",
        ],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    hsts: isProd
      ? { maxAge: 15552000, includeSubDomains: true, preload: false }
      : false,
  })
);

app.use(
  cors({
    origin: [FRONTEND_URL, "https://lammora.vercel.app"],
    credentials: true,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept", "x-csrf-token"],
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());

app.use(attachCsrf);
app.use(globalLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/camera", cameraRoutes);
app.use("/api/photos", photosRoutes);
app.use("/api/session", sessionRoutes);
app.use("/api/gallery", galleryRoutes);
app.use("/api/capture", captureRoutes);

app.get("/healthz", (req, res) => {
  res.json({ ok: true, env: NODE_ENV, time: new Date().toISOString() });
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "protected", "login.html"));
});

app.get("/remote", requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, "protected", "remote.html"));
});

app.get("/camera", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "camera.html"));
});

app.get("/gallery", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "gallery.html"));
});

app.get("/", (req, res) => {
  res.redirect("/camera");
});

app.use(
  express.static(path.join(__dirname, "..", "public"), {
    index: false,
    extensions: false,
  })
);

app.use(notFoundHandler);
app.use(errorHandler);

const io = new Server(server, {
  cors: {
    origin: [FRONTEND_URL, "https://lammora.vercel.app"],
    credentials: true,
  },
  transports: ["polling", "websocket"],
  maxHttpBufferSize: 1e6,
  pingTimeout: 25000,
  pingInterval: 20000,
});

app.set("io", io);
setupRealtime(io);

server.listen(PORT, "0.0.0.0", () => {
  console.log("Lammora backend listening on port " + PORT + " (" + NODE_ENV + ")");
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down");
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down");
  server.close(() => process.exit(0));
});
