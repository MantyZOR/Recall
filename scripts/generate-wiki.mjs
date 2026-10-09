import { writeFileSync } from 'node:fs';
import { wikiMarkdown } from '../src/ui/wiki-content.ts';
writeFileSync(new URL('../docs/mini-wiki.md',import.meta.url),wikiMarkdown(),'utf8');
console.log('Mini-wiki saved to docs/mini-wiki.md');
