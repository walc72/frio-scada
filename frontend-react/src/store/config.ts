import { create } from 'zustand'
import type { AppConfig } from '../types'
import { authFetch } from './auth'

const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'
const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'

const MOCK_CONFIG: AppConfig = {}

interface ConfigState {
  config: AppConfig | null
  loading: boolean
  error: string
  mode: string
  load: () => Promise<void>
  save: () => Promise<boolean>
  setConfig: (cfg: AppConfig) => void
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: null,
  loading: false,
  error: '',
  mode: MODE,

  load: async () => {
    set({ loading: true, error: '' })
    try {
      if (get().mode === 'mock') {
        set({ config: JSON.parse(JSON.stringify(MOCK_CONFIG)) })
      } else {
        // Reintenta ante cortes momentáneos (ej. reconexión de Tailscale =
        // "Failed to fetch") o 5xx transitorios. GET idempotente → seguro.
        const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))
        const MAX = 3
        let lastErr: any
        for (let attempt = 0; attempt < MAX; attempt++) {
          try {
            const r = await authFetch(`${API_BASE}/config`)
            if (!r.ok) {
              // 4xx (auth/validación) = definitivo; 5xx = transitorio → reintentar
              if (r.status >= 500 && attempt < MAX - 1) { lastErr = new Error(`HTTP ${r.status}`); await sleep(600 * (attempt + 1)); continue }
              throw new Error(`HTTP ${r.status}`)
            }
            const data = await r.json()
            set({ config: data })
            lastErr = null
            break
          } catch (e: any) {
            lastErr = e
            if (attempt < MAX - 1) { await sleep(600 * (attempt + 1)); continue }
          }
        }
        if (lastErr) throw lastErr
      }
    } catch (e: any) {
      set({ error: e.message })
    } finally {
      set({ loading: false })
    }
  },

  save: async () => {
    const cfg = get().config
    if (!cfg) return false
    set({ loading: true, error: '' })
    try {
      if (get().mode === 'mock') {
        Object.assign(MOCK_CONFIG, cfg)
      } else {
        const r = await authFetch(`${API_BASE}/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cfg)
        })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
      }
      return true
    } catch (e: any) {
      set({ error: e.message })
      return false
    } finally {
      set({ loading: false })
    }
  },

  setConfig: (config) => set({ config })
}))
