const cloudinary = require("cloudinary").v2;
const crypto = require("crypto");

const UPLOAD_FOLDER = process.env.CLOUDINARY_FOLDER || "lammora";
const MAX_UPLOAD_BYTES =
  parseInt(process.env.MAX_UPLOAD_BYTES, 10) || 15 * 1024 * 1024;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function initCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary credentials missing: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET"
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

function isAllowedMime(mimetype) {
  return ALLOWED_MIME.has(mimetype);
}

function isWithinSizeLimit(size) {
  return typeof size === "number" && size > 0 && size <= MAX_UPLOAD_BYTES;
}

function buildPublicId(captureId) {
  const safe = String(captureId || "").replace(/[^A-Za-z0-9_-]/g, "");
  const suffix = crypto.randomBytes(6).toString("hex");
  return "capture_" + safe + "_" + suffix;
}

function uploadBuffer(buffer, options) {
  return new Promise((resolve, reject) => {
    const opts = options || {};
    const publicId = opts.publicId || buildPublicId(opts.captureId);

    const uploadOptions = {
      folder: UPLOAD_FOLDER,
      public_id: publicId,
      resource_type: "image",
      overwrite: false,
      unique_filename: false,
      invalidate: true,
      transformation: [
        { width: 2560, height: 2560, crop: "limit" },
        { quality: "auto:good" },
        { fetch_format: "auto" },
      ],
    };

    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (err, result) => {
        if (err) {
          return reject(err);
        }
        if (!result) {
          return reject(new Error("cloudinary_empty_result"));
        }
        resolve(result);
      }
    );

    stream.end(buffer);
  });
}

async function uploadWithRetry(buffer, options, attempts) {
  const maxAttempts = attempts || 3;
  let lastErr = null;
  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      const result = await uploadBuffer(buffer, options);
      return result;
    } catch (err) {
      lastErr = err;
      if (i < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
  }
  throw lastErr || new Error("cloudinary_upload_failed");
}

function extractMetadata(result) {
  if (!result) return null;
  return {
    publicId: result.public_id,
    assetId: result.asset_id,
    secureUrl: result.secure_url,
    url: result.url,
    format: result.format,
    bytes: result.bytes,
    width: result.width,
    height: result.height,
    folder: result.folder,
    version: result.version,
    resourceType: result.resource_type,
    createdAt: result.created_at,
  };
}

async function deleteAsset(publicId) {
  if (!publicId || typeof publicId !== "string") {
    throw new Error("invalid_public_id");
  }
  const result = await cloudinary.uploader.destroy(publicId, {
    invalidate: true,
    resource_type: "image",
  });
  return result && result.result === "ok";
}

async function deleteWithRetry(publicId, attempts) {
  const maxAttempts = attempts || 3;
  let lastErr = null;
  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      return await deleteAsset(publicId);
    } catch (err) {
      lastErr = err;
      if (i < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
  }
  throw lastErr || new Error("cloudinary_delete_failed");
}

function buildSignedDeliveryUrl(publicId, options) {
  if (!publicId) return null;
  return cloudinary.url(
    publicId,
    Object.assign(
      {
        secure: true,
        transformation: [{ quality: "auto:good" }, { fetch_format: "auto" }],
      },
      options || {}
    )
  );
}

module.exports = {
  initCloudinary,
  isAllowedMime,
  isWithinSizeLimit,
  uploadWithRetry,
  extractMetadata,
  deleteWithRetry,
  buildSignedDeliveryUrl,
  MAX_UPLOAD_BYTES,
};
