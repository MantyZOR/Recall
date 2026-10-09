import { zipSync, strToU8 } from 'fflate';
import { IMPORT_GUIDE, IMPORT_TEMPLATE, IMPORT_PROMPT, IMPORT_EXAMPLE, IMPORT_KIT_README } from './import-guide-content';
export { IMPORT_GUIDE, IMPORT_TEMPLATE, IMPORT_PROMPT, IMPORT_EXAMPLE } from './import-guide-content';
export function createImportKit(){
 return zipSync({
  'README.md': strToU8(IMPORT_KIT_README),
  'import-guide.md': strToU8(IMPORT_GUIDE),
  'template.md': strToU8(IMPORT_TEMPLATE),
  'ai-prompt.md': strToU8(IMPORT_PROMPT),
  'examples/code-and-math.md': strToU8(IMPORT_EXAMPLE),
 });
}
