const fs = require('fs');
const path = require('path');

function getUploadRoot() {
  const root = process.env.SOCKETAI_UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function caseDir(caseId, subfolder) {
  const dir = path.join(getUploadRoot(), subfolder, String(caseId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeFileName(name) {
  return String(name || 'file')
    .replace(/[^\w.\-()+]/g, '_')
    .slice(0, 200);
}

function relativePath(absolutePath) {
  const root = getUploadRoot();
  return path.relative(root, absolutePath).split(path.sep).join('/');
}

function resolveStoredPath(relative) {
  const root = path.resolve(getUploadRoot());
  const full = path.resolve(root, relative);
  if (!full.startsWith(root)) {
    throw new Error('非法文件路径');
  }
  return full;
}

module.exports = {
  getUploadRoot,
  caseDir,
  safeFileName,
  relativePath,
  resolveStoredPath,
};
