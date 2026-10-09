import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initMemoryCore } from './domain/fsrs';
import { identity } from './storage/db';
import 'katex/dist/katex.min.css';
import './styles.css';
import './readability.css';
import './appearance.css';
import './study-mobile.css';
import './goal-pace.css';
import './phone-setup.css';
import './study-plan.css';
import './help-guide.css';
class Boundary extends Component<{children:ReactNode},{error:string}>{
 state={error:''};
 static getDerivedStateFromError(error:Error){return {error:error.message};}
 render(){return this.state.error?<div className="fatal-error"><h1>Не удалось открыть экран</h1><p>{this.state.error}</p><button onClick={()=>location.reload()}>Открыть заново</button><p>Сохранённые карточки и ответы остаются в локальной базе.</p></div>:this.props.children;}
}
async function main(){await identity();await initMemoryCore();createRoot(document.getElementById('root')!).render(<Boundary><App/></Boundary>);}
main().catch(error=>{const root=document.getElementById('root')!;root.textContent='Не удалось открыть локальное приложение: '+error.message;});

