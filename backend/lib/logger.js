import fs from 'node:fs/promises';
import path from 'node:path';

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const configuredLevel = String(process.env.LOG_LEVEL || 'info').toLowerCase();
const activeLevel = LEVELS[configuredLevel] || LEVELS.info;
const logToFile = String(process.env.LOG_TO_FILE || '1') !== '0';
const logFilePath = process.env.BACKEND_LOG_FILE || path.resolve(process.cwd(), 'backend', 'data', 'backend.log');

let fileWriteQueue = Promise.resolve();

function shouldLog(level) {
  const value = LEVELS[level] || LEVELS.info;
  return value >= activeLevel;
}

function safeSerialize(value, maxLength = 3000) {
  if (value == null) return value;
  if (typeof value === 'string') {
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: safeSerialize(value.stack || '', maxLength),
    };
  }
  try {
    const asString = JSON.stringify(value);
    if (asString.length <= maxLength) {
      return value;
    }
    return safeSerialize(asString, maxLength);
  } catch {
    return String(value);
  }
}

function queueFileWrite(line) {
  if (!logToFile) return;
  fileWriteQueue = fileWriteQueue
    .then(async () => {
      await fs.mkdir(path.dirname(logFilePath), { recursive: true });
      await fs.appendFile(logFilePath, `${line}\n`, 'utf8');
    })
    .catch((error) => {
      const fallback = `[${new Date().toISOString()}] WARN logger.file_write_failed ${error?.message || error}`;
      console.warn(fallback);
    });
}

export function log(level, event, meta = {}) {
  if (!shouldLog(level)) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...safeSerialize(meta),
  };
  const line = JSON.stringify(entry);

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }

  queueFileWrite(line);
}

export function debug(event, meta = {}) {
  log('debug', event, meta);
}

export function info(event, meta = {}) {
  log('info', event, meta);
}

export function warn(event, meta = {}) {
  log('warn', event, meta);
}

export function error(event, meta = {}) {
  log('error', event, meta);
}
