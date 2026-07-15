import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import logger from '../logger';

export const UPLOAD_DIR = process.env.UPLOAD_DIR || '/usr/src/app/uploads';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.docx', '.xlsx',
  '.jpg', '.jpeg', '.png',
  '.txt', '.csv',
  '.mp4', '.mov', '.avi',
  '.zip', '.tar', '.gz',
]);

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.msi', '.bat', '.cmd', '.com', '.scr', '.pif',
  '.sh', '.bash', '.zsh', '.ksh', '.csh',
  '.ps1', '.psm1', '.psd1', '.ps1xml',
  '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh',
  '.php', '.php3', '.php4', '.php5', '.phtml',
  '.py', '.pyc', '.pyo', '.rb', '.pl', '.pm', '.cgi',
  '.jar', '.war', '.class',
  '.swf', '.hta', '.htaccess', '.asp', '.aspx', '.asax',
  '.jsp', '.cfm', '.shtml',
  '.dll', '.sys', '.drv', '.ocx',
  '.app', '.deb', '.rpm',
  '.docm', '.xlsm', '.pptm', '.dotm', '.xlam', '.ppam',
  '.doc', '.xls', '.ppt', '.pps',
  '.bmp', '.gif', '.tiff', '.tif',
  '.svg', '.eps',
]);

const ALLOWED_MIME_PREFIXES = [
  'image/jpeg', 'image/png',
  'text/', 'application/pdf',
  'application/vnd.openxmlformats-officedocument',
  'video/',
  'application/zip', 'application/x-tar', 'application/gzip',
  'text/csv',
];

const allowedMimeType = (mime: string): boolean => {
  return ALLOWED_MIME_PREFIXES.some(prefix => mime.startsWith(prefix));
};

const generateSafeFilename = (originalName: string): string => {
  const ext = path.extname(originalName).toLowerCase();
  const uuid = crypto.randomUUID();
  return `${uuid}${ext}`;
};

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (BLOCKED_EXTENSIONS.has(ext)) {
    logger.warn({ filename: file.originalname, ext }, 'Upload blocked: forbidden extension');
    cb(new Error(`File extension "${ext}" is not allowed for security reasons`));
    return;
  }

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    logger.warn({ filename: file.originalname, ext }, 'Upload blocked: unrecognized extension');
    cb(new Error(`File extension "${ext}" is not in the allowed list`));
    return;
  }

  if (!allowedMimeType(file.mimetype)) {
    logger.warn({ filename: file.originalname, mime: file.mimetype }, 'Upload blocked: forbidden MIME type');
    cb(new Error(`File type "${file.mimetype}" is not allowed`));
    return;
  }

  cb(null, true);
};

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true, mode: 0o750 });
  logger.info({ dir: UPLOAD_DIR }, 'Upload directory created');
}

interface ZipEntry {
  filename: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number;
}

async function parseZipHeaders(filePath: string): Promise<ZipEntry[]> {
  const entries: ZipEntry[] = [];
  const fd = await fs.promises.open(filePath, 'r');
  try {
    const stat = await fd.stat();
    const sigBuf = Buffer.alloc(4);
    let offset = 0;
    while (offset < stat.size - 30) {
      await fd.read(sigBuf, 0, 4, offset);
      const sig = sigBuf.readUInt32LE(0);
      if (sig === 0x02014b50 || sig === 0x06054b50) break;
      if (sig !== 0x04034b50) { offset++; continue; }
      const header = Buffer.alloc(26);
      await fd.read(header, 0, 26, offset + 4);
      const compressedSize = header.readUInt32LE(14);
      const uncompressedSize = header.readUInt32LE(18);
      const filenameLength = header.readUInt16LE(22);
      const extraFieldLength = header.readUInt16LE(24);
      const nameBuf = Buffer.alloc(filenameLength);
      if (filenameLength > 0) await fd.read(nameBuf, 0, filenameLength, offset + 30);
      entries.push({
        filename: nameBuf.toString('utf8'),
        compressedSize,
        uncompressedSize,
        compressionMethod: header.readUInt16LE(6),
      });
      offset += 30 + filenameLength + extraFieldLength + compressedSize;
    }
  } finally {
    await fd.close();
  }
  return entries;
}

async function scanPDF(filePath: string): Promise<string | null> {
  const buf = Buffer.alloc(4096);
  const fd = await fs.promises.open(filePath, 'r');
  try {
    await fd.read(buf, 0, 4096, 0);
  } finally {
    await fd.close();
  }
  if (buf.slice(0, 5).toString() !== '%PDF-') return 'File does not have a valid PDF header';
  const content = buf.toString('utf8').toLowerCase();
  const dangerous = ['/javascript', '/js', '/launch', '/embeddedfile', '/richmedia', '/acroform', '/xfa'];
  for (const p of dangerous) {
    if (content.includes(p)) return `PDF contains suspicious embedded content (${p})`;
  }
  return null;
}

async function scanOfficeFile(filePath: string): Promise<string | null> {
  const entries = await parseZipHeaders(filePath);
  for (const e of entries) {
    const name = e.filename.toLowerCase();
    if (name.includes('vba') || name.includes('macro') || name.endsWith('.bin')) {
      return `Office file contains macros (${e.filename}) which are blocked`;
    }
  }
  return null;
}

async function validateJPEG(filePath: string): Promise<string | null> {
  const buf = Buffer.alloc(2);
  const fd = await fs.promises.open(filePath, 'r');
  try {
    await fd.read(buf, 0, 2, 0);
  } finally {
    await fd.close();
  }
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) return 'File has invalid JPEG header';
  return null;
}

async function validatePNG(filePath: string): Promise<string | null> {
  const buf = Buffer.alloc(8);
  const fd = await fs.promises.open(filePath, 'r');
  try {
    await fd.read(buf, 0, 8, 0);
  } finally {
    await fd.close();
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buf.equals(sig)) return 'File has invalid PNG header';
  return null;
}

async function scanZip(filePath: string): Promise<string | null> {
  const entries = await parseZipHeaders(filePath);
  const MAX_ENTRIES = 5000;
  const MAX_TOTAL_UC = 500 * 1024 * 1024;
  const MAX_RATIO = 150;
  if (entries.length > MAX_ENTRIES) return `Archive contains too many entries (${entries.length})`;
  let totalUc = 0;
  for (const e of entries) {
    totalUc += e.uncompressedSize;
    if (e.compressedSize > 0 && e.uncompressedSize / e.compressedSize > MAX_RATIO) {
      return `Archive entry "${e.filename}" has suspicious compression ratio`;
    }
    const ext = path.extname(e.filename).toLowerCase();
    if (['.zip', '.tar', '.gz', '.7z', '.rar', '.jar', '.war'].includes(ext)) {
      return `Archive contains nested archive "${e.filename}" which is not allowed`;
    }
  }
  if (totalUc > MAX_TOTAL_UC) return `Archive total uncompressed size exceeds limit`;
  return null;
}

async function scanGzip(filePath: string): Promise<string | null> {
  const buf = Buffer.alloc(8);
  const fd = await fs.promises.open(filePath, 'r');
  try {
    await fd.read(buf, 0, 8, 0);
    if (buf[0] !== 0x1F || buf[1] !== 0x8B) return 'File has invalid gzip header';
    const stat = await fd.stat();
    const isizeBuf = Buffer.alloc(4);
    await fd.read(isizeBuf, 0, 4, stat.size - 4);
    const isize = isizeBuf.readUInt32LE(0);
    if (isize > 0 && isize / stat.size > 200) return 'gzip file has suspicious compression ratio, possible bomb';
  } finally {
    await fd.close();
  }
  return null;
}

async function securityScanFile(filePath: string, ext: string): Promise<string | null> {
  switch (ext) {
    case '.pdf': return scanPDF(filePath);
    case '.docx':
    case '.xlsx': return scanOfficeFile(filePath);
    case '.jpg':
    case '.jpeg': return validateJPEG(filePath);
    case '.png': return validatePNG(filePath);
    case '.zip': return scanZip(filePath);
    case '.tar': return null;
    case '.gz': return scanGzip(filePath);
    default: return null;
  }
}

export const securityScan = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.file) { next(); return; }
  const ext = path.extname(req.file.originalname).toLowerCase();
  securityScanFile(req.file.path, ext).then((error) => {
    if (error) {
      try { fs.unlinkSync(req.file!.path); } catch {}
      logger.warn({ filename: req.file!.originalname, ext, error }, 'Upload blocked: security scan failed');
      res.status(400).json({ error });
      return;
    }
    next();
  }).catch((err) => {
    try { fs.unlinkSync(req.file!.path); } catch {}
    logger.error({ err }, 'Security scan error');
    res.status(500).json({ error: 'File validation failed' });
  });
};

export const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
      const safeName = generateSafeFilename(file.originalname);
      cb(null, safeName);
    },
  }),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter,
});

export const fileUploadErrorHandler = (err: any, _req: Request, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'File too large. Maximum size is 10MB.' });
      return;
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      res.status(400).json({ error: 'Only one file can be uploaded at a time.' });
      return;
    }
    res.status(400).json({ error: `Upload error: ${err.message}` });
    return;
  }

  if (err && err.message && (err.message.includes('extension') || err.message.includes('not allowed') || err.message.includes('not in the allowed'))) {
    res.status(400).json({ error: err.message });
    return;
  }

  next(err);
};