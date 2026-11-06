// Публичный API chess.com (без ключей, с CORS): https://www.chess.com/news/view/published-data-api

const API = 'https://api.chess.com/pub/player'

export interface RatingInfo {
  mode: 'rapid' | 'blitz' | 'bullet'
  label: string
  rating: number
}

export interface PlayerSummary {
  username: string
  avatar?: string
  ratings: RatingInfo[]
}

export type Outcome = 'win' | 'loss' | 'draw'

export interface GameSummary {
  url: string
  timeClass: string
  color: 'white' | 'black'
  opponent: string
  opponentRating: number
  outcome: Outcome
  endReason: string
  opening: string
  eco: string
  pgn: string
  endTime: number
}

export interface OpeningStat {
  name: string
  color: 'white' | 'black'
  games: number
  wins: number
  losses: number
  draws: number
}

const DRAW_RESULTS = new Set([
  'agreed',
  'repetition',
  'stalemate',
  'insufficient',
  '50move',
  'timevsinsufficient',
])

const END_REASON_RU: Record<string, string> = {
  win: 'победа',
  checkmated: 'мат',
  resigned: 'сдача',
  timeout: 'время',
  agreed: 'ничья по соглашению',
  repetition: 'повторение',
  stalemate: 'пат',
  insufficient: 'недостаточно материала',
  '50move': 'правило 50 ходов',
  abandoned: 'партия брошена',
  timevsinsufficient: 'время при недостатке материала',
}

interface RawGame {
  url: string
  pgn?: string
  time_class: string
  end_time: number
  white: { username: string; rating: number; result: string }
  black: { username: string; rating: number; result: string }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (res.status === 404) throw new Error('Игрок не найден на chess.com')
  if (!res.ok) throw new Error(`chess.com ответил ошибкой ${res.status}`)
  return (await res.json()) as T
}

export async function fetchPlayer(usernameRaw: string): Promise<PlayerSummary> {
  const username = usernameRaw.trim().toLowerCase()
  if (!username) throw new Error('Введите ник')
  const [profile, stats] = await Promise.all([
    getJson<{ username: string; avatar?: string }>(`${API}/${encodeURIComponent(username)}`),
    getJson<Record<string, { last?: { rating: number } } | undefined>>(
      `${API}/${encodeURIComponent(username)}/stats`,
    ),
  ])
  const modes: [RatingInfo['mode'], string][] = [
    ['rapid', 'Рапид'],
    ['blitz', 'Блиц'],
    ['bullet', 'Пуля'],
  ]
  const ratings: RatingInfo[] = []
  for (const [mode, label] of modes) {
    const r = stats[`chess_${mode}`]?.last?.rating
    if (typeof r === 'number') ratings.push({ mode, label, rating: r })
  }
  return { username: profile.username ?? username, avatar: profile.avatar, ratings }
}

/** Последние партии: берём до двух свежих месячных архивов. */
export async function fetchRecentGames(usernameRaw: string, limit = 40): Promise<GameSummary[]> {
  const username = usernameRaw.trim().toLowerCase()
  const { archives } = await getJson<{ archives: string[] }>(
    `${API}/${encodeURIComponent(username)}/games/archives`,
  )
  const latest = archives.slice(-2).reverse()
  const games: GameSummary[] = []
  for (const url of latest) {
    const data = await getJson<{ games: RawGame[] }>(url)
    for (const g of [...data.games].reverse()) {
      const parsed = summarizeGame(g, username)
      if (parsed) games.push(parsed)
      if (games.length >= limit) return games
    }
  }
  return games
}

export function summarizeGame(g: RawGame, username: string): GameSummary | null {
  const isWhite = g.white.username.toLowerCase() === username.toLowerCase()
  const me = isWhite ? g.white : g.black
  const opp = isWhite ? g.black : g.white
  let outcome: Outcome = 'loss'
  if (me.result === 'win') outcome = 'win'
  else if (DRAW_RESULTS.has(me.result)) outcome = 'draw'
  const pgn = g.pgn ?? ''
  const eco = headerValue(pgn, 'ECO') ?? ''
  const opening = openingFromPgn(pgn)
  const reasonKey = outcome === 'win' ? opp.result : me.result
  return {
    url: g.url,
    timeClass: g.time_class,
    color: isWhite ? 'white' : 'black',
    opponent: opp.username,
    opponentRating: opp.rating,
    outcome,
    endReason: END_REASON_RU[reasonKey] ?? reasonKey,
    opening,
    eco,
    pgn,
    endTime: g.end_time,
  }
}

export function headerValue(pgn: string, key: string): string | undefined {
  const m = pgn.match(new RegExp(`\\[${key} "([^"]*)"\\]`))
  return m?.[1]
}

/** Название дебюта из заголовка ECOUrl, например «Italian Game Giuoco Piano». */
export function openingFromPgn(pgn: string): string {
  const url = headerValue(pgn, 'ECOUrl')
  if (!url) return headerValue(pgn, 'ECO') ?? 'Неизвестный дебют'
  const slug = url.split('/openings/')[1] ?? ''
  // Обрезаем хвост из ходов: берём слова до первого фрагмента с цифрой хода
  const words = slug.split('-').filter((w) => !/^\d/.test(w) && !w.includes('...'))
  const name = words.slice(0, 4).join(' ')
  return name || (headerValue(pgn, 'ECO') ?? 'Неизвестный дебют')
}

export function openingStats(games: GameSummary[]): OpeningStat[] {
  const map = new Map<string, OpeningStat>()
  for (const g of games) {
    const key = `${g.color}:${g.opening}`
    const s =
      map.get(key) ??
      ({ name: g.opening, color: g.color, games: 0, wins: 0, losses: 0, draws: 0 } as OpeningStat)
    s.games++
    if (g.outcome === 'win') s.wins++
    else if (g.outcome === 'loss') s.losses++
    else s.draws++
    map.set(key, s)
  }
  return [...map.values()].sort((a, b) => b.games - a.games)
}
