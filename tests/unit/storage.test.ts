import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { zipSync, unzipSync, strToU8 } from 'fflate';
import { db, merge, append, snapshot, addAttachment, setMeta } from '../../src/storage/db';
import { createArchive, readImport, importArchive } from '../../src/storage/archive';
import { saveCard, saveDeck, importMarkdownCards, purgeCards, purgeDeck } from '../../src/domain/actions';
import { parseMarkdown, MARKDOWN_EXAMPLE } from '../../src/domain/markdown';
import { base, card, deck, op, review } from '../fixtures';
import { deletedDecks } from '../../src/domain/reducer';
import { FSRS7_DEFAULT, FSRS6_DEFAULT } from '../../src/domain/fsrs';
beforeAll(()=>db.open());
beforeEach(async()=>{await Promise.all([db.events.clear(),db.attachments.clear(),db.meta.clear()]);});
const zipFile=(files:Record<string,Uint8Array>)=>new File([zipSync(files).slice().buffer],'test.recall.zip',{type:'application/zip'});
describe('IndexedDB writes and portable archives',()=>{
 it('round-trips legacy automatic, explicit automatic and manual goal pace through portable archives',async()=>{
  await merge(base);
  const goal={id:'goal',name:'План',date:'2026-10-20',minutes:30,retention:.9,deckIds:[deck.id],importance:{}};
  await append('goal.put','goal',goal,['d1']);
  await append('goal.put','auto',{...goal,id:'auto',newPerDay:null},['d1']);
  await append('goal.put','manual',{...goal,id:'manual',newPerDay:50},['d1']);
  const preview=await readImport(new File([(await createArchive()).slice().buffer],'goal-pace.recall.zip'));
  if(!('events'in preview))throw Error('full archive');
  await db.events.clear();await importArchive(preview);await importArchive(preview);
  const s=await snapshot();expect(s.goals).toHaveLength(3);
  expect(s.goals.find(g=>g.id==='goal')!.newPerDay).toBeUndefined();
  expect(s.goals.find(g=>g.id==='auto')!.newPerDay).toBeNull();
  expect(s.goals.find(g=>g.id==='manual')!.newPerDay).toBe(50);
 });
 it('persists introduction separately and round-trips it through a full archive without ratings',async()=>{
  await merge(base);const reading=await append('study.introduce',card.id,{cardId:card.id,cardVersion:'a1',durationMs:18000,context:'review',sessionId:'reading'},['a1']);
  let s=await snapshot();expect(s.cards[0].memory).toBeNull();expect(s.cards[0].reviews).toHaveLength(0);expect(s.cards[0].introductions.map(e=>e.id)).toEqual([reading.id]);
  const bytes=await createArchive(),preview=await readImport(new File([bytes.slice().buffer],'learning.recall.zip'));
  if(!('events'in preview))throw Error('full archive');
  await db.events.clear();await importArchive(preview);await importArchive(preview);s=await snapshot();
  expect(await db.events.count()).toBe(3);expect(s.cards[0].introductions.map(e=>e.id)).toEqual([reading.id]);expect(s.cards[0].memory).toBeNull();
 });
 it('creates several unique linked cloze cards atomically and converts them safely to a normal question',async()=>{
  await merge([base[0]]);const s=await snapshot();
  await saveCard({...card,type:'cloze',front:'{{c1::Один}} {{c2::Два}} {{c3::Три}}'},undefined,s);
  let fresh=await snapshot();expect(fresh.cards).toHaveLength(3);expect(new Set(fresh.cards.map(c=>c.id)).size).toBe(3);expect(new Set(fresh.cards.map(c=>c.siblingId)).size).toBe(1);
  await saveCard({...fresh.cards[0],type:'basic',front:'Один вопрос',back:'Один ответ'},fresh.cards[0],fresh);
  fresh=await snapshot();expect(fresh.cards.filter(c=>!c.deleted)).toHaveLength(1);expect(fresh.cards.find(c=>!c.deleted)?.siblingId).toBeUndefined();
 });
 it('purges only cards still in trash at confirmation time and keeps reviewed records',async()=>{
  await merge([...base,op('r1','review',review,['a1'],3)]);
  await append('card.delete',card.id,{},['a1']);
  const trashed=(await snapshot()).cards[0];
  await append('card.restore',card.id,card,trashed.heads);
  expect(await purgeCards([card.id])).toBe(0);
  expect((await snapshot()).cards[0].deleted).toBe(false);
  await append('card.delete',card.id,{},(await snapshot()).cards[0].heads);
  expect(await purgeCards([card.id,card.id,'missing'])).toBe(1);
  expect(await purgeCards([card.id])).toBe(0);
  const s=await snapshot();
  expect(s.cards[0].purged).toBe(true);expect(s.cards[0].reviews).toHaveLength(1);
  expect(s.events.filter(e=>e.payload.permanent===true)).toHaveLength(1);
 });
 it('prevents a stale editor from recreating cloze cards after permanent deletion',async()=>{
  await merge([...base,op('r1','review',review,['a1'],3)]);const old=(await snapshot()).cards[0];
  await append('card.delete',card.id,{},old.heads);await purgeCards([card.id]);const count=await db.events.count();
  await expect(saveCard({...card,type:'cloze',front:'{{c1::Один}} {{c2::Два}}'},old,await snapshot())).rejects.toThrow('удалена навсегда');
  expect(await db.events.count()).toBe(count);expect((await snapshot()).cards).toHaveLength(1);
 });
 it('roundtrips permanent deletion and stats and cannot resurrect it by importing an older archive',async()=>{
  await merge([...base,op('r1','review',review,['a1'],3)]);
  const old=await readImport(new File([(await createArchive()).slice().buffer],'old.recall.zip'));
  await append('card.delete',card.id,{},['r1']);await purgeCards([card.id]);
  const copy=await readImport(new File([(await createArchive()).slice().buffer],'current.recall.zip'));
  if(!('events'in old)||!('events'in copy))throw Error('archive');
  await db.events.clear();await importArchive(copy);await importArchive(old);
  const s=await snapshot();
  expect(s.cards[0].purged).toBe(true);expect(s.cards[0].reviews).toHaveLength(1);
  expect(s.events.some(e=>e.kind==='card.delete'&&e.payload.permanent===true)).toBe(true);
 });

 it('skips permanent deck deletion when a stale confirmation points to a restored or active deck',async()=>{
  await merge(base);await append('deck.delete',deck.id,{},['d1']);const stale=await snapshot();
  await saveDeck(deck,stale);const count=await db.events.count();
  expect(await purgeDeck(deck.id)).toBe(false);expect(await purgeDeck('missing')).toBe(false);
  expect(await db.events.count()).toBe(count);expect((await snapshot()).decks).toHaveLength(1);
 });
 it('purges all deck children, keeps statistics and rejects stale writers or old-archive resurrection',async()=>{
  await merge([...base,op('r1','review',review,['a1'],3)]);
  const oldCard=(await snapshot()).cards[0],second={...card,id:'second',title:'Отдельно в корзине'};
  await saveCard(second,undefined,await snapshot());const other=(await snapshot()).cards.find(c=>c.id==='second')!;
  await append('card.delete',second.id,{},other.heads);
  const old=await readImport(new File([(await createArchive()).slice().buffer],'old.recall.zip'));
  await append('deck.delete',deck.id,{},['d1']);expect(await purgeDeck(deck.id)).toBe(true);
  const s=await snapshot();expect(s.decks).toEqual([]);expect(deletedDecks(s)).toEqual([]);
  expect(s.cards).toHaveLength(2);expect(s.cards.every(c=>c.deleted&&c.purged)).toBe(true);
  expect(s.cards.find(c=>c.id===card.id)!.reviews).toHaveLength(1);
  expect(s.events.filter(e=>e.kind==='card.delete'&&e.payload.permanent===true)).toHaveLength(2);
  const count=await db.events.count();expect(await purgeDeck(deck.id)).toBe(false);
  await expect(saveDeck(deck,s)).rejects.toThrow('удалена навсегда');
  await expect(saveCard({...card,type:'cloze',front:'{{c1::Один}} {{c2::Два}}'},oldCard,s)).rejects.toThrow('удалена навсегда');
  await expect(saveCard({...card,id:'new'},undefined,s)).rejects.toThrow('удалена навсегда');
  await expect(importMarkdownCards(parseMarkdown(MARKDOWN_EXAMPLE).cards,deck,false,[{id:'not-added',name:'x',type:'image/png',blob:new Blob(['x'])}])).rejects.toThrow('Колода уже удалена');
  expect(await db.events.count()).toBe(count);expect(await db.attachments.count()).toBe(0);
  const copy=await readImport(new File([(await createArchive()).slice().buffer],'current.recall.zip'));
  if(!('events' in old)||!('events' in copy))throw Error('archive');
  await db.events.clear();await importArchive(copy);await importArchive(old);
  const fresh=await snapshot();expect(fresh.decks).toEqual([]);expect(deletedDecks(fresh)).toEqual([]);
  expect(fresh.cards.every(c=>c.purged)).toBe(true);expect(fresh.cards.find(c=>c.id===card.id)!.reviews).toHaveLength(1);
 });

 it('avoids duplicate Markdown content when importing again into an existing deck',async()=>{
  const parsed=parseMarkdown(MARKDOWN_EXAMPLE);
  const first=await importMarkdownCards(parsed.cards,deck,true);expect(first.added).toBe(4);
  const repeated=await importMarkdownCards(parsed.cards,deck,false);expect(repeated).toEqual({added:0,skipped:4});expect((await snapshot()).cards).toHaveLength(4);
 });
 it('rejects a collision without partially writing either an event or attachment',async()=>{
  await merge(base);
  const valid=op('new','card.put',{...card,id:'other'},['a1'],3,'phone',1,'other');
  const changed={...base[1],payload:{...card,back:'Неверная замена'}};
  await expect(merge([valid,changed],[{id:'bad',name:'bad',type:'image/png',blob:new Blob()}])).rejects.toThrow();
  expect(await db.events.count()).toBe(2);expect(await db.attachments.count()).toBe(0);
  await expect(merge([valid,{...valid,id:'second'}])).rejects.toThrow('последовательности');
  expect(await db.events.count()).toBe(2);
 });
 it('rejects invalid causal clocks and assigns monotonic local numbers after imported own history',async()=>{
  await expect(merge([base[0],{...base[1],clock:1}])).rejects.toThrow('причинный');
  await setMeta('identity',{id:'pc',name:'ПК'});await merge(base);
  const next=await append('card.delete','card',{},['a1']);expect(next.seq).toBe(3);expect(next.clock).toBe(3);expect(next.deps).toEqual(['a1']);
 });
 it('roundtrips all history, settings and binary images, excludes authorization, and is idempotent',async()=>{
  const image=new File([new Uint8Array([137,80,78,71,1,2,3])],'example.png',{type:'image/png'}),hash=await addAttachment(image,image.name);
  await merge([base[0],{...base[1],payload:{...card,front:'![Пример](asset:'+hash+')'}}]);
  await setMeta('connection',{token:'should-never-export'});
  await setMeta('syncConnections',[{origin:'https://recall-0123456789ab.local:8443',token:'laptop-secret-never-export'}]);
  const exportedText=Object.values(unzipSync(await createArchive())).map(bytes=>new TextDecoder().decode(bytes)).join('\n');expect(exportedText).not.toContain('should-never-export');expect(exportedText).not.toContain('laptop-secret-never-export');
  const data=await createArchive(),files=unzipSync(data);const manifest=JSON.parse(new TextDecoder().decode(files['manifest.json']));expect(manifest.engine.models.fsrs7.defaultWeights).toEqual(FSRS7_DEFAULT);expect(manifest.engine.models.fsrs6.defaultWeights).toEqual(FSRS6_DEFAULT);expect(manifest.engine.source.commit).toMatch(/^[a-f0-9]{40}$/);expect(Object.keys(files)).toContain('attachments/'+hash+'.png');expect(JSON.stringify(files)).not.toContain('should-never-export');
  await Promise.all([db.events.clear(),db.attachments.clear()]);const preview=await readImport(new File([data.slice().buffer],'copy.recall.zip'));expect('events'in preview).toBe(true);
  if(!('events'in preview))throw Error('archive');
  await importArchive(preview);await importArchive(preview);expect(await db.events.count()).toBe(2);expect(await db.attachments.count()).toBe(1);
  expect(Array.from(new Uint8Array(await (await db.attachments.get(hash))!.blob.arrayBuffer()))).toEqual([137,80,78,71,1,2,3]);
 });
 it('rejects incomplete archives, corrupted binary assets and directory traversal before any changes',async()=>{
  await merge(base);const files=unzipSync(await createArchive());await db.events.clear();
  files['events.json']=strToU8(JSON.stringify([base[1]]));await expect(readImport(zipFile(files))).rejects.toThrow('часть истории');expect(await db.events.count()).toBe(0);
  await expect(readImport(zipFile({'../outside.md':strToU8('bad')}))).rejects.toThrow('путь');
  const image=new File(['data'],'x.png',{type:'image/png'}),hash=await addAttachment(image,'x');await merge(base);
  const corrupt=unzipSync(await createArchive());corrupt['attachments/'+hash+'.png']=strToU8('changed');
  await expect(readImport(zipFile(corrupt))).rejects.toThrow('Контрольная');expect(await db.events.count()).toBe(2);
 });
 it('rewrites local image references in a Markdown pack and never needs external image downloads',async()=>{
  const source='## [basic] Схема\n![Схема](attachments/schema.png)\n:::answer\nПояснение';
  const preview=await readImport(new File([zipSync({'cards.md':strToU8(source),'attachments/schema.png':new Uint8Array([1,2,3])}).slice().buffer],'cards.zip'));
  expect('parsed'in preview).toBe(true);if(!('parsed'in preview))throw Error('markdown');
  expect(preview.parsed.errors).toEqual([]);expect(preview.attachments).toHaveLength(1);expect(preview.parsed.cards[0].front).toContain('asset:'+preview.attachments[0].id);
 });
});

