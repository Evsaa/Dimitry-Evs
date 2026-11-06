// Обёртка над Stockfish (WASM, single-thread lite) в Web Worker.
// Один экземпляр = один воркер. Запросы выполняются строго по очереди.

export interface Score {
  cp?: number
  mate?: number
}

export interface EngineLine {
  multipv: number
  depth: number
  score: Score // с точки зрения стороны, чей ход
  pv: string[] // ходы в UCI
}

export interface AnalyseOptions {
  depth?: number
  movetime?: number
  multipv?: number
}

export type EngineOptions = Record<string, string | number | boolean>

const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`

export class Engine {
  private worker: Worker
  private listeners = new Set<(line: string) => void>()
  private chain: Promise<unknown> = Promise.resolve()
  private ready: Promise<void>

  constructor(options: EngineOptions = {}) {
    this.worker = new Worker(ENGINE_URL)
    this.worker.onmessage = (e: MessageEvent) => {
      const line = typeof e.data === 'string' ? e.data : String(e.data)
      this.listeners.forEach((l) => l(line))
    }
    this.ready = this.init(options)
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd)
  }

  private waitFor(match: (line: string) => boolean): Promise<string> {
    return new Promise((resolve) => {
      const l = (line: string) => {
        if (match(line)) {
          this.listeners.delete(l)
          resolve(line)
        }
      }
      this.listeners.add(l)
    })
  }

  private async init(options: EngineOptions) {
    const uciok = this.waitFor((l) => l === 'uciok')
    this.send('uci')
    await uciok
    for (const [k, v] of Object.entries(options)) {
      this.send(`setoption name ${k} value ${v}`)
    }
    const ok = this.waitFor((l) => l === 'readyok')
    this.send('isready')
    await ok
  }

  /** Анализ позиции. Возвращает линии (по одной на multipv) с последней глубины. */
  analyse(fen: string, opts: AnalyseOptions = {}): Promise<EngineLine[]> {
    const run = async () => {
      await this.ready
      const multipv = opts.multipv ?? 1
      this.send(`setoption name MultiPV value ${multipv}`)
      const lines = new Map<number, EngineLine>()
      const onInfo = (raw: string) => {
        if (!raw.startsWith('info') || !raw.includes(' pv ')) return
        const parsed = parseInfo(raw)
        if (parsed) lines.set(parsed.multipv, parsed)
      }
      this.listeners.add(onInfo)
      const done = this.waitFor((l) => l.startsWith('bestmove'))
      this.send(`position fen ${fen}`)
      if (opts.movetime) this.send(`go movetime ${opts.movetime}`)
      else this.send(`go depth ${opts.depth ?? 12}`)
      const best = await done
      this.listeners.delete(onInfo)
      const result = [...lines.values()].sort((a, b) => a.multipv - b.multipv)
      if (result.length === 0) {
        // Позиция без ходов (мат/пат) или движок вернул bestmove сразу.
        const mv = best.split(' ')[1]
        if (mv && mv !== '(none)') result.push({ multipv: 1, depth: 0, score: { cp: 0 }, pv: [mv] })
      }
      return result
    }
    const p = this.chain.then(run, run)
    this.chain = p.catch(() => undefined)
    return p
  }

  /** Лучший ход (UCI) — для бота. */
  async bestMove(fen: string, opts: AnalyseOptions = {}): Promise<string | null> {
    const lines = await this.analyse(fen, opts)
    return lines[0]?.pv[0] ?? null
  }

  destroy() {
    this.worker.terminate()
    this.listeners.clear()
  }
}

function parseInfo(raw: string): EngineLine | null {
  const t = raw.split(' ')
  const get = (key: string) => {
    const i = t.indexOf(key)
    return i >= 0 ? t[i + 1] : undefined
  }
  const depth = Number(get('depth') ?? 0)
  const multipv = Number(get('multipv') ?? 1)
  const si = t.indexOf('score')
  if (si < 0) return null
  const kind = t[si + 1]
  const val = Number(t[si + 2])
  const score: Score = kind === 'mate' ? { mate: val } : { cp: val }
  const pvi = t.indexOf('pv')
  const pv = pvi >= 0 ? t.slice(pvi + 1) : []
  return { multipv, depth, score, pv }
}

// ---------- Оценка ----------

const CLAMP = 1500

/** Оценка в сантипешках, ограниченная ±1500, с точки зрения стороны, чей ход. */
export function scoreToCp(s: Score): number {
  if (s.mate !== undefined) {
    const sign = s.mate > 0 ? 1 : -1
    return sign * CLAMP
  }
  return Math.max(-CLAMP, Math.min(CLAMP, s.cp ?? 0))
}

export function formatScore(s: Score, whiteToMove: boolean): string {
  const sign = whiteToMove ? 1 : -1
  if (s.mate !== undefined) return `${s.mate * sign > 0 ? '+' : '-'}M${Math.abs(s.mate)}`
  const v = ((s.cp ?? 0) * sign) / 100
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`
}

export type Quality = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'

export const QUALITY_META: Record<Quality, { label: string; color: string }> = {
  best: { label: 'Отлично', color: '#4ade80' },
  good: { label: 'Хороший ход', color: '#a3e635' },
  inaccuracy: { label: 'Неточность', color: '#facc15' },
  mistake: { label: 'Ошибка', color: '#fb923c' },
  blunder: { label: 'Грубая ошибка', color: '#f87171' },
}

/** Потеря в сантипешках → категория. */
export function classifyLoss(loss: number): Quality {
  if (loss <= 15) return 'best'
  if (loss <= 50) return 'good'
  if (loss <= 120) return 'inaccuracy'
  if (loss <= 300) return 'mistake'
  return 'blunder'
}
