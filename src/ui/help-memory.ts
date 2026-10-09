import { DAY, schedule } from '../domain/fsrs';
import type { Algorithm, Memory } from '../domain/types';

// A fixed, invented history. Help examples never read or write the learning database.
export const EXAMPLE_AT = Date.UTC(2026, 0, 1, 12);
export function exampleMemory(algorithm:Algorithm, familiar=true):Memory {
 let memory = schedule(null, 3, EXAMPLE_AT, 0, .9, algorithm);
 if (familiar) {
  memory = schedule(memory, 3, EXAMPLE_AT + 3 * DAY, 3, .9, algorithm);
  memory = schedule(memory, 3, EXAMPLE_AT + 12 * DAY, 9, .9, algorithm);
 }
 return memory;
}
export const HELP_RATINGS = [
 {rating:1, name:'Не вспомнил', compact:'Снова', meaning:'Не смог ответить самостоятельно. Расписание учитывает забывание.'},
 {rating:2, name:'Трудно', compact:'Трудно', meaning:'Ответил правильно, но с большим усилием. Это успешный ответ.'},
 {rating:3, name:'Нормально', compact:'Норм.', meaning:'Вспомнил самостоятельно, с обычным усилием.'},
 {rating:4, name:'Легко', compact:'Легко', meaning:'Вспомнил быстро и уверенно. Это сигнал для более длинного интервала.'},
] as const;
