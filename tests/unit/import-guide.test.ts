import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { IMPORT_GUIDE, IMPORT_TEMPLATE, IMPORT_EXAMPLE, IMPORT_PROMPT, createImportKit } from '../../src/domain/import-guide';
import { parseMarkdown, exportMarkdown, checkTypedAnswer } from '../../src/domain/markdown';
import { deck } from '../fixtures';

describe('downloadable import handbook',()=>{
 it('provides importable templates and examples with math, aliases and correctly fenced code',()=>{
  const template=parseMarkdown(IMPORT_TEMPLATE),sample=parseMarkdown(IMPORT_EXAMPLE);
  expect(template.errors).toEqual([]);expect(template.cards).toHaveLength(3);
  expect(sample.errors).toEqual([]);expect(sample.cards).toHaveLength(6);
  expect(checkTypedAnswer('ЖИЗНЕСТОЙКИЙ',{...sample.cards[0],id:'word',deckId:deck.id})).toBe(true);
  expect(sample.cards[1].back).toContain('\\frac');
  expect(sample.cards[2].back).toContain('numbers.map(number => number * number)');
  expect(sample.cards[5].back).toContain('items.append("c")');
  const cards=sample.cards.map((c,i)=>({...c,id:'sample-'+i,deckId:deck.id}));
  const roundtrip=parseMarkdown(exportMarkdown(deck,cards));
  expect(roundtrip.errors).toEqual([]);
  expect(roundtrip.cards.map(({siblingId,...c})=>c)).toEqual(sample.cards.map(({siblingId,...c})=>c));
 });
 it('ships the current handbook, AI prompt and UTF-8 examples in a distinct kit for unpacking',()=>{
  const files=unzipSync(createImportKit());
  expect(Object.keys(files).sort()).toEqual(['README.md','ai-prompt.md','examples/code-and-math.md','import-guide.md','template.md']);
  expect(strFromU8(files['README.md'])).toContain('Сам этот ZIP не предназначен для импорта');
  expect(strFromU8(files['template.md'])).toBe(IMPORT_TEMPLATE);
  expect(strFromU8(files['examples/code-and-math.md'])).toBe(IMPORT_EXAMPLE);
  expect(strFromU8(files['import-guide.md'])).toBe(IMPORT_GUIDE);
  expect(strFromU8(files['ai-prompt.md'])).toBe(IMPORT_PROMPT);
  expect(IMPORT_GUIDE).toBe(readFileSync('docs/markdown-format.md','utf8').replace(/\r\n/g,'\n'));
  expect(IMPORT_PROMPT).toBe(readFileSync('docs/ai-prompt.md','utf8').replace(/\r\n/g,'\n'));
  expect(IMPORT_GUIDE).toContain('cards.md');
  expect(IMPORT_PROMPT).toContain('без вступления, заключения и внешнего блока кода');
 });
});
