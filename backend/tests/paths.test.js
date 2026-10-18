const path = require('path');
const { uploadDir, isEphemeralUploadDir } = require('../src/config/paths');

describe('upload directory resolution', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('defaults to ./uploads when nothing is configured', () => {
    delete process.env.UPLOAD_DIR;
    delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
    expect(uploadDir()).toBe(path.resolve('./uploads'));
  });

  it('uses the container volume mount path when UPLOAD_DIR is unset', () => {
    delete process.env.UPLOAD_DIR;
    process.env.RAILWAY_VOLUME_MOUNT_PATH = '/data';
    // path.resolve because a POSIX-style mount path is resolved against the
    // current drive on Windows; on the Linux container it stays /data.
    expect(uploadDir()).toBe(path.resolve('/data'));
  });

  it('prefers an explicit UPLOAD_DIR over the volume mount path', () => {
    process.env.UPLOAD_DIR = '/data/imizi';
    process.env.RAILWAY_VOLUME_MOUNT_PATH = '/data';
    expect(uploadDir()).toBe(path.resolve('/data/imizi'));
  });

  it('resolves a relative UPLOAD_DIR against the working directory', () => {
    process.env.UPLOAD_DIR = 'storage';
    expect(path.isAbsolute(uploadDir())).toBe(true);
    expect(uploadDir()).toBe(path.resolve('storage'));
  });

  it('normalises separators and trailing slashes', () => {
    // storageService.readFile rejects keys that fall outside path.resolve(dir),
    // so a configured path has to come back in resolved form.
    process.env.UPLOAD_DIR = process.platform === 'win32' ? 'C:/data/uploads/' : '/data/uploads/';
    expect(uploadDir()).toBe(path.resolve(process.env.UPLOAD_DIR));
    expect(uploadDir().endsWith(path.sep)).toBe(false);
  });

  it('flags a production deployment with no persistent upload location', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.UPLOAD_DIR;
    delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
    expect(isEphemeralUploadDir()).toBe(true);

    process.env.RAILWAY_VOLUME_MOUNT_PATH = '/data';
    expect(isEphemeralUploadDir()).toBe(false);
  });

  it('does not flag development, where a fresh uploads directory is expected', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.UPLOAD_DIR;
    delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
    expect(isEphemeralUploadDir()).toBe(false);
  });
});
