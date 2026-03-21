import winston from 'winston';
import fs from 'fs';
import path from 'path';

const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(logColors);

const LOG_DIR = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function serializeMeta(meta) {
  try {
    return JSON.stringify(meta);
  } catch (_error) {
    return '[unserializable-meta]';
  }
}

const format = winston.format.combine(
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, stack, ...meta } = info;
    const metaString = Object.keys(meta).length ? ` ${serializeMeta(meta)}` : '';
    const stackString = stack ? `\n${stack}` : '';
    return `${timestamp} ${level}: ${message}${metaString}${stackString}`;
  })
);

const transports = [
  new winston.transports.Console(),
  new winston.transports.File({
    filename: path.join(LOG_DIR, 'error.log'),
    level: 'error',
  }),
  new winston.transports.File({ filename: path.join(LOG_DIR, 'all.log') }),
];

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: logLevels,
  format,
  transports,
});

export default logger;
