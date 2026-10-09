import { describe, expect, it } from 'vitest';
import { parseMarkdown, exportMarkdown, MARKDOWN_EXAMPLE, checkTypedAnswer, clozeDisplay } from '../../src/domain/markdown';
import { card, deck } from '../fixtures';
describe('open Markdown card format',()=>{
 it('roundtrips words, math, code, long answers, tags, aliases and linked clozes',()=>{
  const parsed=parseMarkdown(MARKDOWN_EXAMPLE+'\n## [basic] Код\nЧто делает функция?\n:::answer\n```python\n## Это код, а не карточка\nprint(":::answer")\n```\nОбъяснение в несколько строк.\n');
  expect(parsed.errors).toEqual([]);expect(parsed.cards).toHaveLength(5);
  expect(parsed.cards[1].back).toContain('\\frac');expect(parsed.cards[4].back).toContain('## Это код');
  const cards=parsed.cards.map((c,i)=>({...c,id:'c'+i,deckId:deck.id})),restored=parseMarkdown(exportMarkdown(deck,cards));
  expect(restored.errors).toEqual([]);expect(restored.cards.map(({siblingId,...c})=>c)).toEqual(parsed.cards.map(({siblingId,...c})=>c));
  expect(parsed.cards[2].siblingId).toBe(parsed.cards[3].siblingId);
 });
 it('does not import incomplete questions and provides understandable errors',()=>{
  expect(parseMarkdown('## [basic] Нет ответа\nВопрос').errors[0]).toContain('ответ');
  expect(parseMarkdown('## [cloze] Нет пропусков\nПросто текст').errors[0]).toContain('пропуск');
  expect(parseMarkdown('---\na: [\n---\n').errors.length).toBeGreaterThan(0);
 });
 it('normalizes short aliases and leaves semantic or code answers for self assessment',()=>{
  const short={...card,type:'input' as const,back:'Жёлтый',aliases:['желтоватый']};
  expect(checkTypedAnswer('  ЖЕЛТЫЙ ',short)).toBe(true);expect(checkTypedAnswer('желтоватый',short)).toBe(true);expect(checkTypedAnswer('красный',short)).toBe(false);
  expect(checkTypedAnswer('x',{...short,back:'Один\nДва'})).toBeNull();expect(checkTypedAnswer('x',{...short,back:'`code`'})).toBeNull();
  expect(clozeDisplay('{{c1::Париж::город}} и {{c2::Франция}}',1,false,true)).toBe('〔город〕 и Франция');
 });
});
