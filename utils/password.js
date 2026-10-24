const bcrypt = require("bcryptjs");

const SALT_ROUNDS = 12;

async function hashPassword(plain) {
  if (typeof plain !== "string" || plain.length === 0) {
    throw new Error("invalid_password");
  }
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  if (typeof plain !== "string" || typeof hash !== "string") return false;
  if (!plain || !hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch (e) {
    return false;
  }
}

function verifyPasswordConstantTime(plain, hash) {
  return verifyPassword(plain, hash);
}

module.exports = {
  hashPassword,
  verifyPassword,
  verifyPasswordConstantTime,
};
