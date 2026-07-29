export type ProtocolType = "modbus" | "mqtt" | "opcua" | "generic";
export type TransportType = "serial" | "tcp" | "mock" | "none";
export type DeviceStatus = "ok" | "timeout" | "faulted" | "offline";

export interface SerialTransportConfig {
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: "none" | "even" | "odd";
}

export interface TcpTransportConfig {
  ipAddress: string;
  tcpPort: number;
}

export interface ChannelNode {
  id: string; // e.g., "chan_1"
  name: string; // e.g., "Modbus Network 1"
  protocol: ProtocolType;
  transport: TransportType;
  transportConfig?: SerialTransportConfig | TcpTransportConfig;
  status: DeviceStatus;
}

export type Endianness = "ABCD" | "CDAB" | "BADC" | "DCBA";
export type ModbusRegisterType = "coil" | "discrete" | "input" | "holding";
export type DataType = "bool" | "int16" | "uint16" | "int32" | "uint32" | "float32";

export interface ModbusTag {
  id: string;
  name: string;
  registerType: ModbusRegisterType;
  address: number;
  dataType: DataType;
}

export interface ModbusDeviceConfig {
  slaveId: number;
  pollingRateMs: number;
  timeoutMs?: number;
  byteOrder: Endianness;
  tags: ModbusTag[];
}

export interface MqttDeviceConfig {
  baseTopic: string;
}

export type DeviceConfig = ModbusDeviceConfig | MqttDeviceConfig | Record<string, any>;

export interface DeviceNode {
  id: string; // e.g., "dev_1"
  channelId: string; // Reference to parent channel
  name: string; // e.g., "Main PLC"
  enabled: boolean; // Whether polling is active
  config: DeviceConfig; 
  profileId?: string; // Reference to a reusable device profile/template
  status: DeviceStatus;
}
