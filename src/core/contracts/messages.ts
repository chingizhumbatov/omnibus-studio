export type LogLevel = "info" | "warn" | "error";

export interface SystemLog {
  id: string;
  timestamp: number;
  level: LogLevel;
  source: string; // e.g. "core", "modbus", "ui"
  message: string;
}

export interface SnifferFrame {
  id: string;
  timestamp: number;
  channelId: string; // which channel this traffic belongs to
  direction: "tx" | "rx";
  payload: string; // HEX string e.g. "01 03 00 00 00 02 C4 0B"
}
