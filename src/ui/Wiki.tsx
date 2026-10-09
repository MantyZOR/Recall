import { useMemo, useState } from 'react';
import { BookOpen, Download, Search } from 'lucide-react';
import { WIKI_TOPICS, wikiMarkdown } from './wiki-content';
import { download } from '../storage/archive';
import { Button, Empty, PageHeader } from './common';
import { Markdown } from './Markdown';
import { HelpGuide } from './HelpGuide';
import { AlgorithmLab } from './AlgorithmLab';

const normalize=(text:string)=>text.toLowerCase().replaceAll('ё','е');
function AlgorithmDetails({body,query}:{body:string;query:string}) {
 const [intro,...sections]=body.split(/^### /m);
 const needle=normalize(query.trim());
 return <><Markdown>{intro}</Markdown><AlgorithmLab/><div className="help-deep-reading"><h3>Разобраться подробнее</h3><p>Открывай только интересующие главы. Здесь описано поведение нашей версии Recall.</p></div><div className="help-algorithm-sections">{sections.map((section,i)=>{
  const end=section.indexOf('\n'),title=section.slice(0,end),text=section.slice(end+1);
  const searchMatch=Boolean(needle&&normalize(section).includes(needle));
  return <details className="help-algorithm-section" key={title} open={searchMatch?true:undefined}><summary><span className="help-chapter-number">{String(i+1).padStart(2,'0')}</span><span>{title}</span></summary><div><Markdown>{text}</Markdown></div></details>;
 })}</div></>;
}
export function Wiki({importCards}:{importCards:()=>void}){
 const [query,setQuery]=useState(''),[chosen,setChosen]=useState('overview');
 const matches=useMemo(()=>WIKI_TOPICS.filter(topic=>normalize([topic.title,topic.summary,topic.keywords,topic.body].join(' ')).includes(normalize(query.trim()))),[query]);
 const active=matches.find(topic=>topic.id===chosen)||matches[0];
 const openTopic=(id:string)=>{setQuery('');setChosen(id);};
 return <>
  <PageHeader eyebrow="СПРАВКА" title="Как работает Recall" description="Сначала попробуй короткие примеры. Когда захочется деталей — загляни в алгоритмы. Всё доступно без сети.">
   <Button kind="secondary" onClick={()=>download('Recall — мини-вики.md',wikiMarkdown(),'text/markdown;charset=utf-8')}><Download size={17}/>Скачать справку</Button>
  </PageHeader>
  <div className="search-input wiki-search"><Search size={18}/><input aria-label="Поиск по справке" placeholder="Найти в справке: алгоритмы, цели, корзина…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
  {active?<div className="wiki-layout">
   <nav className="wiki-topics" aria-label="Темы справки">{matches.map(topic=><button key={topic.id} className={'wiki-topic '+(active.id===topic.id?'active':'')} aria-pressed={active.id===topic.id} onClick={()=>setChosen(topic.id)}><strong>{topic.title}</strong><small>{topic.summary}</small></button>)}</nav>
   <article className={'wiki-article '+(active.id==='overview'?'wiki-guide-article':'')} key={active.id}><div className="wiki-article-label"><BookOpen size={16}/>Справка Recall</div><h2>{active.title}</h2><p className="wiki-summary">{active.summary}</p>{active.id==='cards'&&<Button kind="secondary" onClick={importCards}>Перейти к импорту</Button>}
    {active.id==='overview'?(query.trim()?<><Button kind="secondary" onClick={()=>setQuery('')}>Открыть интерактивные примеры</Button><Markdown>{active.body}</Markdown></>:<HelpGuide openTopic={openTopic}/>):active.id==='algorithms'?<AlgorithmDetails body={active.body} query={query}/>:<Markdown>{active.body}</Markdown>}
   </article>
  </div>:<Empty title="В справке ничего не найдено" description="Попробуй короткое слово: «оценка», «офлайн», «Лейтнер» или «архив»."><Button kind="secondary" onClick={()=>setQuery('')}>Сбросить поиск</Button></Empty>}
 </>;
}
