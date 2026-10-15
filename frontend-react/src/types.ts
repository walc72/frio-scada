export interface CamarasConfig {
  rangos?: Record<string, { min: number; max: number }>   // temperatura por cámara (C4, C5)
}

// Conexión con el PLC: la lee el poller (weg-modbus-poller/src/index.js) y la recarga sola al guardar
export interface PlcConfig { ip: string; port: number; unitId: number }

export interface AppConfig {
  plc?: PlcConfig
  camaras?: CamarasConfig
  [clave: string]: unknown
}
