import rehypeHighlight from 'rehype-highlight';
import { visit } from 'unist-util-visit';
import { toText } from 'hast-util-to-text';
import type { Root } from 'hast';
import type { VFile } from 'vfile';

export const MAX_HIGHLIGHT_CHARS=50000;
export function codeHighlighting(){
 const highlight=rehypeHighlight({detect:false,plainText:['text','txt','plaintext']});
 return (tree:Root,file:VFile)=>{
  visit(tree,'element',node=>{
   if(node.tagName==='code'&&toText(node,{whitespace:'pre'}).length>MAX_HIGHLIGHT_CHARS){
    const classes=node.properties.className;
    node.properties.className=[...(Array.isArray(classes)?classes:[]),'no-highlight'];
   }
  });
  highlight(tree,file);
 };
}
