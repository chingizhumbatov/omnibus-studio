export type LogLevel = "info" | "warn" | "error";

export interface SystemLog {
  id: string;
  timestamp: number;
  level: LogLevel;
  source: string; // e.g. "core", "modbus", "ui"
  message: string;
}

