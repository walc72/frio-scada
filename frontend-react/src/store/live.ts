import { create } from 'zustand'
import mqtt, { MqttClient } from 'mqtt'
import { useAuthStore, authFetch } from './auth'
import { useCamarasStore } from './camaras'

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'
// MQTT websocket proxeado por nginx en /mqtt (el broker no expone el puerto 9001)
const MQTT_URL = (import.meta.env.VITE_MQTT_URL as string) ||
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/mqtt`

export interface ReplicaStatus {
  lastSync: number | null
  lagSec: number | null
  live: boolean
  error: string | null
  configured?: boolean
  source?: string | null
}

interface LiveState {
  connected: boolean
  replicaStatus: ReplicaStatus | null
  connect: () => void
  disconnect: () => void
}

let mqttClient: MqttClient | null = null

export const useLiveStore = create<LiveState>((set) => ({
  connected: false,
  replicaStatus: null,

  connect: () => {
    if (mqttClient) return
    // /mqtt exige token de sesión (lo valida la API); sin sesión no se conecta
    const token = useAuthStore.getState().token
    if (!token) return
    const url = new URL(MQTT_URL)
    url.searchParams.set('token', token)
    mqttClient = mqtt.connect(url.toString(), {
      clientId: 'frio-react-' + Math.random().toString(16).slice(2, 10),
      reconnectPeriod: 2000,
    })
    let failStreak = 0
    mqttClient.on('connect', () => {
      failStreak = 0
      set({ connected: true })
      mqttClient?.subscribe(['frio/replica/status', 'frio/estado', 'frio/latido', 'frio/eventos', 'frio/status'])
    })
    mqttClient.on('close', () => {
      set({ connected: false })
      // Tras 3 fallos seguidos se chequea la sesión: si venció, authFetch hace
      // logout y se corta el bucle de reintentos con un token muerto.
      failStreak++
      if (failStreak % 3 === 0 && useAuthStore.getState().token) {
        authFetch(`${API_BASE}/me`).catch(() => { /* sin red: sigue reintentando */ })
      }
    })
    mqttClient.on('message', (topic, payload, packet) => {
      try {
        const msg = JSON.parse(payload.toString())
        if (topic === 'frio/replica/status') set({ replicaStatus: msg as ReplicaStatus })
        else if (topic === 'frio/estado') useCamarasStore.getState().setEstado(msg, !!packet.retain)
        else if (topic === 'frio/latido') useCamarasStore.getState().setLatido(msg, !!packet.retain)
        else if (topic === 'frio/eventos') useCamarasStore.getState().addEvento(msg)
        else if (topic === 'frio/status') useCamarasStore.getState().setStatus(msg)
      } catch (e) { console.debug('[MQTT] Failed to parse message:', e) }
    })
  },

  disconnect: () => {
    if (mqttClient) { mqttClient.end(true); mqttClient = null }
    set({ connected: false })
  },
}))
