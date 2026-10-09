import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { codeHighlighting } from './code-highlighting';
import { db } from '../storage/db';
function LocalImage({src,alt}:{src?:string;alt?:string}){
 const [url,setUrl]=useState('');
 useEffect(()=>{let active=true,local='';if(src?.startsWith('asset:'))db.attachments.get(src.slice(6)).then(a=>{if(active&&a){local=URL.createObjectURL(a.blob);setUrl(local);}});return()=>{active=false;if(local)URL.revokeObjectURL(local);};},[src]);
 return url?<img src={url} alt={alt||'Изображение карточки'} loading="lazy"/>:<span className="missing-image">Изображение {alt?': '+alt:''} · добавь файл в редакторе или импортируй архив с вложениями</span>;
}
export function Markdown({children,className=''}:{children:string;className?:string}){
 return <div className={'markdown '+className}><ReactMarkdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[rehypeKatex,codeHighlighting]} urlTransform={url=>url.startsWith('asset:')?url:/^https?:|^mailto:/.test(url)?url:''} components={{img:LocalImage,a:({href,children})=><a href={href} target="_blank" rel="noreferrer">{children}</a>}}>{children}</ReactMarkdown></div>;
}

