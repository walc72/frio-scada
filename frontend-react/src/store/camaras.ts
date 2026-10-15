import { create } from 'zustand'

import { recepcionFresca } from '../lib/estadoGrupo'

export type Estado = Record<string, number | string>
export interface Evento { ts: number; texto: string; estado: number }

interface CamarasState {
  estado: Estado | null
  ts: number | null            // _ts del poller del último ciclo con el PLC respondiendo (solo para mostrar)
  recibidoEn: number | null    // reloj local al recibir ese ciclo: base de la frescura
  conectado: boolean           // el poller leyó el PLC en el último ciclo
  poller: string | null        // 'online' | 'offline'
  mapa: string | null          // 'ok' | 'incompatible' (frio/status, frio/estado o frio/latido)
  eventos: Evento[]            // más nuevo primero, máx. 50
  setEstado: (msg: any, retenido?: boolean) => void
  setLatido: (msg: any, retenido?: boolean) => void
  setStatus: (msg: any) => void
  addEvento: (msg: any) => void
}

// Conexión y frescura, comunes a frio/estado y frio/latido
function latido(s: CamarasState, _ts: unknown, _conectado: unknown, _mapa: unknown, retenido: boolean) {
  return {
    conectado: !!_conectado,
    mapa: _mapa === 'incompatible' ? 'incompatible' : 'ok',
    // con el PLC caído el ts de "último ok" no avanza
    ts: _conectado && typeof _ts === 'number' ? _ts : s.ts,
    // la frescura usa el reloj local; un retenido viejo no cuenta
    recibidoEn: _conectado && recepcionFresca(retenido, _ts as number | undefined, Date.now()) ? Date.now() : s.recibidoEn,
  }
}

export const useCamarasStore = create<CamarasState>((set) => ({
  estado: null, ts: null, recibidoEn: null, conectado: false, poller: null, mapa: null, eventos: [],

  // frio/estado = estado plano + _ts (ms) + _conectado [+ _mapa, _version] (salidaMqtt.js). Retenido; el poller
  // lo publica solo con cambios o cada 30 s: lo que avanza cada ciclo es frio/latido.
  setEstado: (msg, retenido = false) => {
    const { _ts, _conectado, _mapa, _version, ...estado } = msg ?? {}
    set(s => ({
      estado: Object.keys(estado).length ? estado : s.estado,
      ...latido(s, _ts, _conectado, _mapa, retenido),
    }))
  },
  // frio/latido = {_ts, _conectado, _mapa?, _version?} cada ciclo (no retenido en planta; la réplica de oficina lo retiene)
  setLatido: (msg, retenido = false) => set(s => latido(s, msg?._ts, msg?._conectado, msg?._mapa, retenido)),
  setStatus: (msg) => set({ poller: msg?.poller ?? null, mapa: msg?.mapa ?? null }),
  addEvento: (msg) => set(s => ({ eventos: [{ ts: msg?._ts ?? Date.now(), texto: String(msg?.texto ?? ''), estado: Number(msg?.estado ?? 0) }, ...s.eventos].slice(0, 50) })),
}))
