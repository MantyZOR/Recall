import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
const svg=await readFile(new URL('../public/icon.svg',import.meta.url));
for(const size of [180,192,512])await sharp(svg).resize(size,size).png().toFile(new URL('../public/icon-'+size+'.png',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
await sharp(svg).resize(410,410).extend({top:51,bottom:51,left:51,right:51,background:'#7269dd'}).png().toFile(new URL('../public/icon-maskable.png',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
