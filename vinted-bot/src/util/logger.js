import { config } from '../config.js';

const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const active = levels[config.logLevel] ?? 2;

function log(level, ...args) {
  if (levels[level] > active) return;
  const ts = new Date().toISOString();
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(`${ts} [${level}]`, ...args);
}

export const logger = {
  error: (...a) => log('error', ...a),
  warn: (...a) => log('warn', ...a),
  info: (...a) => log('info', ...a),
  debug: (...a) => log('debug', ...a),
};
