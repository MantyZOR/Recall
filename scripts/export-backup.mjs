import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync, strToU8 } from 'fflate';
import { validateEvents, assetIds } from '../src/domain/protocol.mjs';
import { ENGINE_INFO } from '../src/domain/model-info.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensions = {'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'};

export function exportBackup({snapshotPath, assetsDirectory, outputPath}) {
  const database = new DatabaseSync(path.resolve(snapshotPath), {readOnly:true});
  let events, attachments;
  try {
    database.exec('BEGIN');
    events = validateEvents(database.prepare('SELECT json FROM events ORDER BY clock,device,seq,id').all().map(row=>JSON.parse(row.json)));
    attachments = database.prepare('SELECT id,name,type,size FROM assets ORDER BY id').all();
    database.exec('COMMIT');
  } finally { database.close(); }
  const known = new Map(events.map(event=>[event.id,event]));
  const sequences = new Set();
  if (known.size !== events.length) throw Error('В копии повторяются идентификаторы событий.');
  for (const event of events) {
    const sequence = event.deviceId+':'+event.seq;
    if (sequences.has(sequence)) throw Error('В копии повторяются номера событий устройства.');
    sequences.add(sequence);
    for (const dependency of event.deps) {
      const previous = known.get(dependency);
      if (!previous) throw Error('В этой копии не хватает части истории. Заверши синхронизацию и создай новую резервную копию.');
      if (previous.clock >= event.clock) throw Error('Некорректная причинная последовательность в копии.');
    }
  }
  const files = {}, entries = [];
  for (const attachment of attachments) {
    if (!/^[a-f0-9]{64}$/.test(attachment.id) || !extensions[attachment.type]) throw Error('Повреждено описание изображения.');
    const bytes = readFileSync(path.join(path.resolve(assetsDirectory), attachment.id));
    if (bytes.length > 8*1024*1024 || bytes.length !== attachment.size) throw Error('Некорректный размер изображения '+attachment.id+'.');
    if (createHash('sha256').update(bytes).digest('hex') !== attachment.id) throw Error('Контрольная сумма изображения не совпадает: '+attachment.id+'.');
    const file = 'attachments/'+attachment.id+'.'+extensions[attachment.type];
    files[file] = new Uint8Array(bytes);
    entries.push({id:attachment.id,name:String(attachment.name),type:attachment.type,path:file});
  }
  const knownAssets = new Set(entries.map(entry=>entry.id));
  if (assetIds(events).some(id=>!knownAssets.has(id))) throw Error('В копии отсутствует описание нужного изображения.');
  const manifest = {format:'recall-archive',version:1,createdAt:new Date().toISOString(),eventFormat:'causal-log-v1',models:['FSRS-7','FSRS-6','SM-2','Leitner'],engine:ENGINE_INFO,attachments:entries};
  files['manifest.json'] = strToU8(JSON.stringify(manifest,null,2));
  files['events.json'] = strToU8(JSON.stringify(events,null,2));
  files['README.txt'] = strToU8('Recall — архив восстановления из SQLite, формат 1.\nИмпортируй этот ZIP в настройках приложения. Журнал объединится по ID; существующие данные сохранятся.\nmanifest.json содержит описание моделей и SHA-256 вложений. events.json содержит историю и настройки.\nАвторизация устройств, сертификаты и секреты не экспортируются.\n');
  const sizes = Object.values(files).map(bytes=>bytes.byteLength);
  if (sizes.some(size=>size>32*1024*1024) || sizes.reduce((total,size)=>total+size,0)>128*1024*1024) throw Error('Копия превышает поддерживаемый объём импорта: 32 МБ на файл и 128 МБ после распаковки.');
  const zip = zipSync(files,{level:6});
  if (zip.byteLength>64*1024*1024) throw Error('Архив превышает поддерживаемые 64 МБ. Исходная резервная копия сохранена.');
  mkdirSync(path.dirname(path.resolve(outputPath)),{recursive:true});
  writeFileSync(path.resolve(outputPath),zip,{flag:'wx'});
  return {path:path.resolve(outputPath),events:events.length,images:entries.length};
}

function cli() {
  const data = path.resolve(process.env.RECALL_DATA_DIR || path.join(root,'data'));
  const options = {};
  for (let index=2;index<process.argv.length;index+=2) {
    const key = process.argv[index], value = process.argv[index+1];
    if (!['--snapshot','--assets','--output'].includes(key) || !value) throw Error('Формат: node scripts/export-backup.mjs [--snapshot файл.sqlite] [--assets папка] [--output новый.zip]');
    options[key] = value;
  }
  const backups = path.join(data,'backups');
  const latest = existsSync(backups) ? readdirSync(backups).filter(name=>name.endsWith('.sqlite')).sort().at(-1) : undefined;
  const snapshotPath = options['--snapshot'] || (latest && path.join(backups,latest));
  if (!snapshotPath) throw Error('Резервных копий пока нет. В Recall открой «Настройки» и создай резервную копию после синхронизации.');
  const outputPath = options['--output'] || path.join(data,'exports','recall-recovered-'+new Date().toISOString().replace(/[:.]/g,'-')+'.recall.zip');
  const result = exportBackup({snapshotPath,assetsDirectory:options['--assets'] || path.join(data,'assets'),outputPath});
  console.log('Архив готов: '+result.path+'\nСобытий: '+result.events+', изображений: '+result.images+'\nИмпортируй ZIP в «Настройки → Восстановить или объединить архив». Исходная база не изменена.');
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try { cli(); } catch(error) { console.error('Не удалось подготовить архив: '+error.message);process.exitCode=1; }
}
