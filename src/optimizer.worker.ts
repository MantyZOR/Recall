import { optimize } from './domain/optimizer';
self.onmessage=(e)=>{try{const result=optimize(e.data.items,p=>self.postMessage({progress:p}));self.postMessage({result});}catch(error){self.postMessage({error:(error as Error).message});}};

