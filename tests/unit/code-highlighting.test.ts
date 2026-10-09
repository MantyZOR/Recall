import { describe, expect, it } from 'vitest';
import { toText } from 'hast-util-to-text';
import { VFile } from 'vfile';
import type { Root, Element } from 'hast';
import { codeHighlighting, MAX_HIGHLIGHT_CHARS } from '../../src/ui/code-highlighting';

function render(language:string,source:string){
 const code:Element={type:'element',tagName:'code',properties:{className:language?['language-'+language]:[]},children:[{type:'text',value:source}]};
 const tree:Root={type:'root',children:[{type:'element',tagName:'pre',properties:{},children:[code]}]};
 codeHighlighting()(tree,new VFile());
 return code;
}
describe('offline syntax highlighting',()=>{
 it('preserves indentation and all code characters while adding syntax tokens',()=>{
  for(const [language,source] of [
   ['js','function counter() {\n  let n = 0;\n  return () => ++n;\n}\n'],
   ['python','def greet(name):\n    return "Hello, " + name\n'],
   ['sql',"SELECT name FROM people WHERE id = 1;\n"],
   ['html','<script>window.injected = true</script>\n'],
  ]){
   const code=render(language,source);expect(toText(code,{whitespace:'pre'})).toBe(source);
   expect(code.children.some(n=>n.type==='element'&&n.tagName==='span')).toBe(true);
   expect(JSON.stringify(code)).not.toContain('"tagName":"script"');
  }
 });
 it('keeps unknown, unlabelled and very large blocks as readable plain text',()=>{
  for(const [language,source] of [
   ['unknown-language','## [basic] Это строка кода\n:::answer\n  <b>Текст</b>\n'],
   ['','const value = "test";\n'],
   ['javascript','const value = "'+'x'.repeat(MAX_HIGHLIGHT_CHARS)+'";\n'],
  ]){
   const code=render(language,source);expect(toText(code,{whitespace:'pre'})).toBe(source);
   expect(code.children.every(n=>n.type==='text')).toBe(true);
  }
 });
});
