function isNonEmptyString(value, maxLen) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  if (maxLen && trimmed.length > maxLen) return false;
  return true;
}

function isUsername(value) {
  if (!isNonEmptyString(value, 64)) return false;
  return /^[A-Za-z0-9_.-]{2,64}$/.test(value);
}

function isPasswordLike(value) {
  return typeof value === "string" && value.length >= 1 && value.length <= 256;
}

function isCountdown(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return false;
  if (!Number.isInteger(n)) return false;
  if (n < min || n > max) return false;
  return true;
}

function isCaptureId(value) {
  if (!isNonEmptyString(value, 64)) return false;
  return /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

function isPhotoId(value) {
  if (!isNonEmptyString(value, 64)) return false;
  return /^[A-Za-z0-9_-]{4,64}$/.test(value);
}

function isCursor(value) {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value !== "string") return false;
  return value.length <= 512;
}

function isLimit(value, def, max) {
  if (value === undefined || value === null || value === "") return true;
  const n = Number(value);
  if (!Number.isFinite(n)) return false;
  if (!Number.isInteger(n)) return false;
  if (n < 1 || n > (max || 50)) return false;
  return true;
}

function normalizeLimit(value, def, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return def;
  return Math.min(n, max);
}

module.exports = {
  isNonEmptyString,
  isUsername,
  isPasswordLike,
  isCountdown,
  isCaptureId,
  isPhotoId,
  isCursor,
  isLimit,
  normalizeLimit,
};
