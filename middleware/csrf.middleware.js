const csurf = require("csurf");
const { randomBytes } = require("crypto");

const csrfProtection = csurf({
  cookie: {
    key: "_csrf",
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
  },
  ignoreMethods: ["GET", "HEAD", "OPTIONS"],
  value: (req) => {
    return (
      (req.body && req.body._csrf) ||
      req.headers["x-csrf-token"] ||
      req.query._csrf
    );
  },
});

function attachCsrf(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD") {
    csrfProtection(req, res, () => {
      try {
        res.cookie("_csrf_public", req.csrfToken(), {
          httpOnly: false,
          sameSite: "lax",
          secure: true,
          path: "/",
          maxAge: 2 * 60 * 60 * 1000,
        });
      } catch (e) {}
      next();
    });
  } else {
    csrfProtection(req, res, (err) => {
      if (err && err.code === "EBADCSRFTOKEN") {
        return res.status(403).json({ success: false, error: "invalid_csrf" });
      }
      if (err) {
        return res.status(500).json({ success: false, error: "csrf_error" });
      }
      next();
    });
  }
}

function issueSessionCsrf(req, res) {
  try {
    const token = req.csrfToken();
    res.cookie("_csrf_public", token, {
      httpOnly: false,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 2 * 60 * 60 * 1000,
    });
    return token;
  } catch (e) {
    return randomBytes(16).toString("hex");
  }
}

module.exports = {
  attachCsrf,
  issueSessionCsrf,
};
