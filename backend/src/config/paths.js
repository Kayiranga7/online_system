const path = require('path');

/**
 * Where uploaded files live when S3 is not configured.
 *
 * On a container host the filesystem is rebuilt on every deploy, so uploads
 * written to the working directory disappear with the next release (and the
 * database is left pointing at images that no longer exist). Railway exposes
 * the mount path of an attached volume as RAILWAY_VOLUME_MOUNT_PATH, so that is
 * used when UPLOAD_DIR is not set explicitly. Without a volume the app still
 * runs, but uploads are per-container and vanish on redeploy.
 *
 * Read at call time rather than at module load so a test or a late
 * dotenv.config() sees the current environment.
 */
function uploadDir() {
  const configured = process.env.UPLOAD_DIR
    || process.env.RAILWAY_VOLUME_MOUNT_PATH
    || './uploads';
  // Always resolve: on Windows a configured path such as "C:/data/uploads" or
  // "/data/uploads/" keeps its separators and trailing slash otherwise, and the
  // containment check in storageService.readFile compares against
  // path.resolve()-ed paths - so reads would be rejected as invalid keys.
  return path.resolve(configured);
}

// True when uploads are on a filesystem that a deploy will throw away.
function isEphemeralUploadDir() {
  return !process.env.UPLOAD_DIR
    && !process.env.RAILWAY_VOLUME_MOUNT_PATH
    && process.env.NODE_ENV === 'production';
}

module.exports = { uploadDir, isEphemeralUploadDir };
