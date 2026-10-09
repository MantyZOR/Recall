import { Download } from 'lucide-react';
import { createImportKit } from '../domain/import-guide';
import { download } from '../storage/archive';
import { Button } from './common';

export function ImportDownloads(){
 return <div className="import-downloads">
  <Button kind="secondary" onClick={()=>download('recall-import-kit.zip',createImportKit(),'application/zip')}><Download size={20}/>Набор для ИИ и импорта</Button>
  <p className="hint">Правила, запрос для ИИ, шаблон и примеры в одном ZIP. Распакуй набор, чтобы подготовить свой файл.</p>
 </div>;
}
