import 'fake-indexeddb/auto';
import {beforeAll,beforeEach,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {choiceProblem,checkChoiceAnswer,shuffleChoices} from '../../src/domain/choice';
import {parseMarkdown,exportMarkdown} from '../../src/domain/markdown';
import {EventSchema,assetIds} from '../../src/domain/protocol.mjs';
import {db,merge,snapshot,append} from '../../src/storage/db';
import {saveCard,importMarkdownCards,cardData} from '../../src/domain/actions';
import {createArchive,readImport,importArchive} from '../../src/storage/archive';
import {deck,card,base,review,op} from '../fixtures';
const example=readFileSync('examples/choice.md','utf8'),options=[{id:'a',text:'2',correct:true,feedback:'Чётное'},{id:'b',text:'3',correct:false},{id:'c',text:'4',correct:true}];
beforeAll(()=>db.open());beforeEach(async()=>{await db.events.clear();await db.attachments.clear();await db.meta.clear();});
describe('choice cards',()=>{
 it('requires all correct options with no omissions, extras, unknown or repeated IDs',()=>{
  expect(checkChoiceAnswer(options,['c','a'])).toBe(true);
  for(const selected of [[],['a'],['a','b','c'],['b'],['a','c','other'],['a','a','c']])expect(checkChoiceAnswer(options,selected)).toBe(false);
  expect(checkChoiceAnswer([],[])).toBe(false);expect(checkChoiceAnswer(options.slice(0,2),['a'])).toBe(true);
 });
 it('shuffles a copy using a fresh random draw, without changing identity or the correct set',()=>{
  const mixed=shuffleChoices(options,()=>0);expect(mixed).not.toEqual(options.map(o=>o.id));expect([...mixed].sort()).toEqual(['a','b','c']);expect(options.map(o=>o.id)).toEqual(['a','b','c']);expect(shuffleChoices(options,()=>.999)).toEqual(['a','b','c']);
 });
 it('roundtrips a real import-kit example with formulas and option feedback',()=>{
  const parsed=parseMarkdown(example);expect(parsed.errors).toEqual([]);expect(parsed.cards).toHaveLength(2);expect(parsed.cards[1].options?.filter(o=>o.correct)).toHaveLength(2);expect(parsed.cards[1].options![1].text).toContain('\\vec{\\beta}');
  const cards=parsed.cards.map((c,i)=>({...c,id:'q'+i,deckId:deck.id}));expect(parseMarkdown(exportMarkdown(deck,cards)).cards).toEqual(parsed.cards);
 });
 it('preserves multiline code, formulas and feedback without interpreting fenced delimiters',()=>{
  const md='## [choice] Код\nЧто верно?\n:::option correct\n```python\n## [basic] Это код\n:::answer\nprint(2)\n```\n:::feedback\n$2+2=4$\n:::option wrong\nНет\n';const parsed=parseMarkdown(md);expect(parsed.errors).toEqual([]);expect(parsed.cards[0].back).toBe('');expect(parsed.cards[0].options![0].text).toContain(':::answer');expect(parsed.cards[0].options![0].feedback).toBe('$2+2=4$');
 });
 it('rejects malformed choices before import or journal merge',()=>{
  for(const bad of [options.slice(0,1),options.map(o=>({...o,correct:true})),options.map(o=>({...o,correct:false})),[options[0],{...options[1],id:'a'}],[options[0],{...options[1],text:'2'}],[{...options[0],text:' '},options[1]]]){
   expect(choiceProblem(bad)).not.toBe('');expect(EventSchema.safeParse({...base[1],payload:{...card,type:'choice',options:bad}}).success).toBe(false);
  }
  expect(parseMarkdown('## [choice] Нет вариантов\nВопрос').errors.length).toBeGreaterThan(0);
  expect(parseMarkdown('## [choice] Неверный маркер\nВопрос\n:::option yes\nОтвет').errors.length).toBeGreaterThan(0);
  expect(parseMarkdown('## [basic] Не choice\nВопрос\n:::option correct\nВариант\n:::answer\nОтвет').errors.length).toBeGreaterThan(0);
 });
 it('discovers assets inside options and feedback for archive and network transfer',()=>{
  const hash='a'.repeat(64),other='b'.repeat(64),event={...base[1],payload:{...card,type:'choice',options:[{id:'1',text:'![Картинка](asset:'+hash+')',correct:true},{id:'2',text:'Нет',correct:false,feedback:'![Разбор](asset:'+other+')'}]}};
  expect(assetIds([event])).toEqual([hash,other]);expect(EventSchema.safeParse(event).success).toBe(true);
 });
 it('saves, materializes and archives options and selected answers without losing history',async()=>{
  await merge([base[0],{...base[1],payload:{...card,type:'choice',back:'',options}}]);
  const c=(await snapshot()).cards[0];expect(cardData(c).options).toEqual(options);
  await append('review',card.id,{...review,rating:1,choiceAnswer:{selectedIds:['a'],correct:false}},[c.version]);
  const archive=await createArchive();await db.events.clear();const preview=await readImport(new File([archive.slice().buffer],'choice.recall.zip'));if(!('events'in preview))throw Error('archive');await importArchive(preview);await importArchive(preview);
  const restored=(await snapshot()).cards[0];expect(restored.options).toEqual(options);expect(restored.reviews[0].payload.choiceAnswer).toEqual({selectedIds:['a'],correct:false});expect(await db.events.count()).toBe(3);
  const invalid=op('wrong-grade','review',{...review,rating:3,choiceAnswer:{selectedIds:['a'],correct:false}},['a1'],4,'choice',1);expect(EventSchema.safeParse(invalid).success).toBe(false);
 });
 it('deduplicates imported content independently of option IDs and order, while preserving distinct tests',async()=>{
  await merge(base);const initial={...card,type:'choice' as const,options};await saveCard(initial,(await snapshot()).cards[0],await snapshot());
  const imported={...initial,options:[...options].reverse().map((o,i)=>({...o,id:'o'+i}))};
  expect(await importMarkdownCards([imported],deck,false)).toEqual({added:0,skipped:1});
  expect(await importMarkdownCards([{...imported,options:imported.options.map(o=>({...o,correct:o.text==='3'}))}],deck,false)).toEqual({added:1,skipped:0});
 });
});
