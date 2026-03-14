import { createLogger, format, transports } from "winston";

const { combine, timestamp, colorize, printf, errors } = format;

const lineFormat = printf(({ level, message, timestamp: ts, stack }) => {
  const base = `${ts} [${level}] ${message}`;
  return stack ? `${base}\n${stack}` : base;
});

export const logger = createLogger({
  level: process.env.LOG_LEVEL ?? "info",
  format: combine(
    errors({ stack: true }),
    timestamp({ format: "HH:mm:ss" }),
    colorize({ all: true }),
    lineFormat,
  ),
  transports: [new transports.Console()],
});
