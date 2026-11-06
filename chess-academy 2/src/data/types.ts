export type Side = 'white' | 'black'

export interface BookMove {
  /** Ход в SAN (как в chess.js), например "Nf3", "O-O", "exd5" */
  san: string
  /** Объяснение идеи хода простым русским языком, 1–2 предложения */
  why: string
}

/** Позиция для тренировки «найди сильнейший ход» */
export interface Drill {
  /** Ходы от начальной позиции (SAN). Ход следующей стороны — за игрока. */
  moves: string[]
  prompt: string
  /** Что объяснить после ответа (почему именно так) */
  idea: string
}

/** Вариант дебюта: как именно сыграл соперник / какой план выбран */
export interface Variation {
  id: string
  title: string
  /** Короткая подпись: «Чёрные отвечают конём на f6» */
  tagline: string
  /** Полная линия от начальной позиции, 8–14 полуходов, все ходы ВАЛИДНЫ */
  moves: BookMove[]
  /** Главная мысль варианта, 1–2 предложения */
  keyIdea: string
  /** 1–2 тренировочные позиции, где игрок ищет сильнейший ход */
  drills: Drill[]
}

export interface Opening {
  id: string
  title: string
  subtitle: string
  side: Side
  emoji: string
  pitch: string
  goals: string[]
  variations: Variation[]
}

export type Theme = 'fork' | 'pin' | 'skewer' | 'discovered' | 'double-attack' | 'mate-pattern' | 'deflection' | 'trapped'

export interface Puzzle {
  /** Начальная позиция FEN (ходит игрок) */
  fen: string
  prompt: string
  /** Правильная последовательность SAN: ход игрока, ответ соперника, ход игрока… Нечётное число элементов. */
  solution: string[]
  /** Объяснение: почему это работает */
  idea: string
}

export interface TacticTopic {
  id: string
  title: string
  emoji: string
  /** Что это за приём — простыми словами */
  summary: string
  /** Как его заметить: 2–4 признака */
  signs: string[]
  /** Типичная ошибка новичка */
  pitfall: string
  /** Демонстрационная позиция: показывает идею до задач */
  demo: { fen: string; moves: string[]; caption: string }
  puzzles: Puzzle[]
}
