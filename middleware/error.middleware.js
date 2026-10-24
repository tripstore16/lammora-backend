function notFoundHandler(req, res) {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ success: false, error: "not_found" });
  }
  return res.status(404).send("Not Found");
}

function errorHandler(err, req, res, next) {
  const isProd = process.env.NODE_ENV === "production";
  const status = err && err.status ? err.status : 500;

  if (!isProd) {
    console.error("[error]", err && err.message ? err.message : err);
  }

  if (res.headersSent) {
    return next(err);
  }

  if (req.path.startsWith("/api/")) {
    return res.status(status).json({
      success: false,
      error: status === 500 ? "internal_error" : err.code || "request_failed",
    });
  }

  return res
    .status(status)
    .send(status === 500 ? "Internal Server Error" : "Request Failed");
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
