import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Check, CheckCheck, ChevronRight, CircleHelp, FileCheck2, FileDown, FileText, FolderOpen, ImagePlus, LayoutGrid, ListOrdered, LoaderCircle, LockKeyhole, Mic, Monitor, MoreHorizontal, Plus, Search, Settings2, ShieldCheck, Sparkles, Square, Trash2, Upload, Users, WandSparkles, X } from 'lucide-react';
import type { DisplaySource, EngineConfig, Frame, Procedure, Settings, Step, Workspace } from '../shared/types';
import { draftSteps, emptyProcedure, formatTime } from '../shared/logic';
import { api, desktop } from './api';
import { annotateFrame, VoiceRecorder } from './recorder';

const roles = ['SDR', 'Assistente de Vendas', 'Vendedor Interno', 'Supervisor de Vendas', 'Gerente de Vendas'];
const categories = ['Cadastros', 'Prospecção', 'Vendas', 'Pedidos', 'Gestão', 'Pós-venda'];
const initialSettings: Settings = { configured: false, running: false, whisperExecutable: '', whisperModel: '', llamaExecutable: '', llamaModel: '', threads: 4 };
type Tab = 'steps' | 'voice' | 'references' | 'review';

function Modal({ title, children, close, wide = false }: { title: string; children: ReactNode; close: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const elements = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]');
        if (!elements?.length) return;
        const first = elements[0], last = elements[elements.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => { document.removeEventListener('keydown', handler); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop"><div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}><header><h2>{title}</h2><button className="icon-button" onClick={close} aria-label="Fechar janela"><X size={20} /></button></header>{children}</div></div>;
}

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const data = useRef<Workspace | null>(null); data.current = workspace;
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = workspace?.procedures.find(p => p.id === selectedId);
  const [roleFilter, setRoleFilter] = useState('Todos');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('steps');
  const [saveStatus, setSaveStatus] = useState('Carregando…');
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState('');
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState<EngineConfig>(initialSettings);
  const [showGuide, setShowGuide] = useState(false);
  const [displays, setDisplays] = useState<DisplaySource[] | null>(null);
  const [displayId, setDisplayId] = useState('');
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [microphoneId, setMicrophoneId] = useState('');
  const [useVoice, setUseVoice] = useState(true);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [pending, setPending] = useState(0);
  const recorder = useRef<VoiceRecorder | null>(null);
  const target = useRef<{ id: string; offset: number } | null>(null);
  const audioTasks = useRef<Promise<void>[]>([]);
  const frameTasks = useRef<Promise<void>[]>([]);
  const stopping = useRef(false);
  const hadAudioFailure = useRef(false);
  const finishRef = useRef<() => Promise<void>>(async () => {});
  const [failedAudio, setFailedAudio] = useState<{ audio: ArrayBuffer; start: number; end: number; id: string }[]>([]);
  const [generated, setGenerated] = useState<{ id: string; objective: string; steps: Step[] } | null>(null);
  const [undo, setUndo] = useState<{ id: string; objective: string; steps: Step[] } | null>(null);
  const [largeFrame, setLargeFrame] = useState<Frame | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const locked = recording || Boolean(busy) || pending > 0;

  const notify = (text: string, error = false) => setNotice({ text, error });
  const errorMessage = (error: unknown) => error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Não foi possível concluir a operação.';
  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    try { await action(); } catch (e) { notify(errorMessage(e), true); } finally { setBusy(''); }
  }
  function patch(id: string, change: Partial<Procedure> | ((p: Procedure) => Partial<Procedure>)) {
    const current = data.current;
    if (!current) return;
    const next = { ...current, procedures: current.procedures.map(p => p.id === id ? { ...p, ...(typeof change === 'function' ? change(p) : change), updatedAt: new Date().toISOString() } : p) };
    data.current = next; setWorkspace(next);
  }
  function create(title = 'Novo procedimento', category = 'Vendas') {
    if ((data.current?.procedures.length ?? 0) >= 100) { notify('Limite de 100 procedimentos nesta biblioteca. Exporte e arquive os materiais antigos antes de criar novos.', true); return; }
    const p = { ...emptyProcedure(), title, category, role: roleFilter === 'Todos' ? 'SDR' : roleFilter };
    setWorkspace(current => current ? { ...current, procedures: [p, ...current.procedures] } : current);
    setSelectedId(p.id); setTab('steps'); setUndo(null);
  }
  function openSettings() { setSettingsForm(settings); setShowSettings(true); }

  useEffect(() => {
    let active = true;
    api.load().then(w => { if (active) setWorkspace(w); }).catch(e => { if (active) setLoadError(errorMessage(e)); });
    api.settings().then(s => { if (active) setSettings(s); }).catch(e => { if (active) notify(errorMessage(e), true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!workspace) return;
    setSaveStatus('Salvando…'); let active = true;
    const timer = setTimeout(() => { api.save(workspace).then(() => { if (active) setSaveStatus('Salvo neste computador'); }).catch(e => { if (active) { setSaveStatus('Não foi possível salvar'); notify(errorMessage(e), true); } }); }, 450);
    return () => { active = false; clearTimeout(timer); };
  }, [workspace]);
  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = setTimeout(() => setNotice(null), 6000); return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!recording) return;
    const start = Date.now(); const timer = setInterval(() => setElapsed((Date.now() - start) / 1000), 500);
    return () => clearInterval(timer);
  }, [recording]);
  useEffect(() => {
    const offFrame = api.onFrame(frame => {
      const current = target.current; if (!current) return;
      const task = annotateFrame({ ...frame, at: frame.at + current.offset }).then(annotated => {
        patch(current.id, p => ({ frames: [...p.frames, annotated] }));
      }).catch(e => notify(`Não foi possível marcar a captura: ${errorMessage(e)}`, true));
      frameTasks.current.push(task);
    });
    const offStatus = api.onCaptureStatus(status => {
      if (status.message) notify(status.message, true);
      if (!status.active && target.current && !stopping.current) void finishRef.current();
    });
    return () => { offFrame(); offStatus(); };
  }, []);

  function queueAudio(audio: ArrayBuffer, start: number, end: number, id: string) {
    if (target.current && !stopping.current) void api.captureNow().catch(e => notify(errorMessage(e), true));
    setPending(n => n + 1);
    const task = api.transcribe(audio, 'audio/wav', start, end).then(transcripts => {
      patch(id, p => ({ transcripts: [...p.transcripts, ...transcripts].sort((a, b) => a.start - b.start), steps: [...p.steps, ...draftSteps(transcripts, p.frames)] }));
    }).catch(e => {
      hadAudioFailure.current = true;
      setFailedAudio(chunks => [...chunks, { audio, start, end, id }]);
      notify(`Um trecho não foi transcrito: ${errorMessage(e)} O áudio foi preservado para recuperação.`, true);
    }).finally(() => setPending(n => n - 1));
    audioTasks.current.push(task);
  }
  async function generatePreview(p: Procedure) {
    const result = await api.generate(p); setGenerated({ id: p.id, ...result });
  }
  async function prepareRecording() {
    if (!selected) return;
    if (selected.frames.length >= 180) { notify('Este procedimento já tem muitas capturas. Remova as desnecessárias ou crie outro procedimento.', true); return; }
    await run('Preparando captura', async () => {
      const screens = await api.displays(); if (!screens.length) throw new Error('Nenhum monitor disponível para captura.');
      setDisplays(screens); setDisplayId(screens[0].id); setUseVoice(settings.configured);
      const devices = await navigator.mediaDevices.enumerateDevices(); setMicrophones(devices.filter(d => d.kind === 'audioinput'));
    });
  }
  async function startRecording() {
    if (!selected) return;
    await run('Iniciando gravação', async () => {
      stopping.current = false; hadAudioFailure.current = false; audioTasks.current = []; frameTasks.current = [];
      const offset = Math.max(0, ...selected.frames.map(f => f.at + 2), ...selected.transcripts.map(t => t.end + 2));
      target.current = { id: selected.id, offset };
      if (useVoice) {
        recorder.current = new VoiceRecorder((audio, start, end) => queueAudio(audio, start + offset, end + offset, selected.id), message => notify(message, true));
        try { await recorder.current.prepare(microphoneId); } catch (e) { target.current = null; throw new Error(`Não foi possível acessar o microfone. Verifique a permissão de áudio no Windows. ${errorMessage(e)}`); }
      }
      try { await api.startCapture(displayId); }
      catch (e) { await recorder.current?.stop(); recorder.current = null; target.current = null; throw e; }
      recorder.current?.start(); setRecording(true); setElapsed(0); setDisplays(null); setTab('voice');
    });
  }
  async function finishRecording() {
    if (!target.current || stopping.current) return;
    stopping.current = true; const id = target.current.id;
    await run('Concluindo gravação e transcrição', async () => {
      await api.stopCapture(); await recorder.current?.stop(); recorder.current = null; setRecording(false);
      await Promise.all([...audioTasks.current, ...frameTasks.current]);
      target.current = null;
      const procedure = data.current?.procedures.find(p => p.id === id);
      if (hadAudioFailure.current) { setTab('voice'); notify('Uma parte da narração não foi transcrita. Recupere os trechos na aba Narração antes de organizar o procedimento.', true); }
      else if (settings.configured && procedure?.transcripts.length) { setBusy('Organizando o procedimento com IA local'); await generatePreview(procedure); }
      else { setTab('steps'); notify('Capturas registradas. Adicione as instruções e associe as imagens às etapas.'); }
    });
    target.current = null; setRecording(false);
  }
  finishRef.current = finishRecording;

  if (loadError) return <main className="loading"><ShieldCheck size={42} /><h1>Seus arquivos foram preservados</h1><p>{loadError}</p><button className="primary" onClick={() => location.reload()}>Tentar novamente</button></main>;
  if (!workspace) return <main className="loading"><LoaderCircle className="spin" /><p>Preparando seu espaço de trabalho…</p></main>;
  const filtered = workspace.procedures.filter(p => (roleFilter === 'Todos' || p.role === roleFilter) && `${p.title} ${p.category} ${p.role}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  const referencesCount = workspace.procedures.reduce((count, p) => count + p.references.length, 0);

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-icon"><BookOpen size={23} /></span><span>playbook<span className="brand-dot">.</span><small>STUDIO</small></span></div>
      <div className="workspace-label"><span className="company-avatar">C</span><div>Espaço comercial<small>Empresa confidencial</small></div><LockKeyhole size={14} /></div>
      <span className="nav-caption">SEU CONHECIMENTO</span>
      <button className={`nav-item ${!selected ? 'active' : ''}`} disabled={locked} onClick={() => { setSelectedId(null); setRoleFilter('Todos'); }}><LayoutGrid size={18} /> Biblioteca <span>{workspace.procedures.length}</span></button>
      <div className="nav-section"><Users size={17} /> POR CARGO</div>
      {roles.map((role, i) => <button className={`role-item ${roleFilter === role ? 'active' : ''}`} disabled={locked} key={role} onClick={() => { setSelectedId(null); setRoleFilter(role); }}><span className={`role-dot color-${i}`} />{role}</button>)}
      <div className="sidebar-bottom"><div className="privacy-card"><ShieldCheck size={21} /><strong>Seu conhecimento é seu.</strong><p>Documentos e IA no seu computador. Sem envio para a nuvem.</p><span><i /> Processamento local</span></div>
      <button className="nav-item" disabled={locked} onClick={openSettings}><Settings2 size={18} /> Configurações <span className={settings.configured ? 'tiny-dot green' : 'tiny-dot'} /></button>
      <button className="nav-item" onClick={() => setShowGuide(true)}><CircleHelp size={18} /> Como funciona</button><div className="sidebar-footer">PLAYBOOK STUDIO <span>v0.1</span></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">Espaço comercial <ChevronRight size={14} /><span>{selected ? 'Editor de procedimento' : 'Biblioteca'}</span></div><div className="topbar-right"><span className="local-badge"><span /> Modo offline</span><span className="avatar">EU</span></div></header>
      <main className={selected ? 'main-content editor-main' : 'main-content'}>
        {!desktop && <div className="browser-banner"><Monitor size={16} /> Prévia no navegador: edição de texto disponível. Captura, IA local e exportação exigem o aplicativo desktop.</div>}
        {selected ? <>
          <div className="editor-heading"><button className="back-link" disabled={locked} onClick={() => setSelectedId(null)}><ArrowLeft size={16} /> Biblioteca</button><div className="editor-actions"><span className={`save-state ${saveStatus.includes('Não') ? 'error-text' : ''}`} aria-live="polite"><CheckCheck size={15} />{saveStatus}</span><button className="secondary" disabled={locked || !selected.steps.length} onClick={() => setExportOpen(true)}><FileDown size={17} /> Exportar</button></div></div>
          <div className="editor-layout"><div className="document-panel">
            <div className="document-meta"><span className="eyebrow">PROCEDIMENTO OPERACIONAL</span><span className="draft-badge">Rascunho</span></div>
            <input className="document-title" aria-label="Título do procedimento" maxLength={500} value={selected.title} disabled={locked} onChange={e => patch(selected.id, { title: e.target.value })} />
            <div className="metadata-fields"><label>Cargo responsável<select disabled={locked} value={selected.role} onChange={e => patch(selected.id, { role: e.target.value })}>{roles.map(r => <option key={r}>{r}</option>)}{!roles.includes(selected.role) && <option>{selected.role}</option>}</select></label><label>Categoria<select disabled={locked} value={selected.category} onChange={e => patch(selected.id, { category: e.target.value })}>{categories.map(c => <option key={c}>{c}</option>)}</select></label><span className="system-tag">TBS <span>Tecnicon Business Suite</span></span></div>
            <div className="record-toolbar">{recording ? <button className="danger" onClick={() => void finishRecording()}><Square size={16} /> Encerrar · {formatTime(elapsed)}</button> : <button className="primary" disabled={locked} onClick={() => void prepareRecording()}><Mic size={17} /> Gravar processo</button>}<button className="secondary" disabled={locked} onClick={() => void run('Importando arquivos', async () => { const refs = await api.importReferences(); if (selected.references.length + refs.length > 30) throw new Error('Limite de 30 documentos de referência por procedimento.'); patch(selected.id, p => ({ references: [...p.references, ...refs] })); setTab('references'); })}><Upload size={16} /> Importar arquivo</button><button className="ai-button" disabled={locked || (!selected.steps.length && !selected.transcripts.length && !selected.references.length)} onClick={() => void run('Organizando texto com IA local', () => generatePreview(selected))}><Sparkles size={17} /> Organizar com IA</button></div>
            {recording && <div className="recording-banner"><span className="recording-dot" /> Capturando a tela selecionada. Pare o mouse por 1 segundo para registrar uma imagem. <kbd>Ctrl Shift Enter</kbd> encerra.</div>}
            {busy && <div className="processing-banner" role="status"><LoaderCircle className="spin" size={17} />{busy}… {pending > 0 ? `${pending} trecho(s) de áudio na fila.` : 'O tempo depende do desempenho do computador.'}</div>}
            <div className="tabs" role="tablist" aria-label="Conteúdo do procedimento">{([['steps', 'Procedimento', selected.steps.length], ['voice', 'Narração', selected.transcripts.length], ['references', 'Referências', selected.references.length], ['review', 'Revisão', null]] as const).map(([id, name, count]) => <button role="tab" aria-selected={tab === id} key={id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{name}{count !== null && <span>{count}</span>}</button>)}</div>
            {tab === 'steps' && <div className="steps-content"><label className="objective-field">Objetivo do procedimento<textarea value={selected.objective} maxLength={30000} disabled={locked} placeholder="O que a pessoa será capaz de fazer ao concluir este processo?" onChange={e => patch(selected.id, { objective: e.target.value })} /></label>
              {undo?.id === selected.id && <div className="undo-bar">Versão anterior disponível.<button disabled={locked} onClick={() => { patch(selected.id, { objective: undo.objective, steps: undo.steps }); setUndo(null); }}>Desfazer aplicação da IA</button></div>}
              {!selected.steps.length && <div className="empty-document"><ListOrdered size={34} /><h3>Transforme sua rotina em um passo a passo</h3><p>Grave uma demonstração no TBS ou escreva a primeira etapa. Você poderá revisar cada instrução e cada captura.</p></div>}
              {selected.steps.map((step, index) => <article className="step-card" key={step.id}><div className="step-number">{String(index + 1).padStart(2, '0')}</div><div className="step-body"><div className="step-header"><input aria-label={`Título da etapa ${index + 1}`} value={step.title} maxLength={500} disabled={locked} onChange={e => patch(selected.id, p => ({ steps: p.steps.map(s => s.id === step.id ? { ...s, title: e.target.value } : s) }))} /><div className="step-controls"><button className="icon-button" disabled={locked || index === 0} aria-label={`Mover etapa ${index + 1} para cima`} onClick={() => patch(selected.id, p => { const steps = [...p.steps]; [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]]; return { steps }; })}><ArrowUp size={14} /></button><button className="icon-button" disabled={locked || index === selected.steps.length - 1} aria-label={`Mover etapa ${index + 1} para baixo`} onClick={() => patch(selected.id, p => { const steps = [...p.steps]; [steps[index + 1], steps[index]] = [steps[index], steps[index + 1]]; return { steps }; })}><ArrowDown size={14} /></button><button className="icon-button" disabled={locked} aria-label={`Excluir etapa ${index + 1}`} onClick={() => { if (confirm('Excluir esta etapa? A captura continuará na galeria.')) patch(selected.id, p => ({ steps: p.steps.filter(s => s.id !== step.id) })); }}><Trash2 size={14} /></button></div></div><textarea aria-label={`Descrição da etapa ${index + 1}`} value={step.description} maxLength={30000} disabled={locked} placeholder="Descreva a ação, os campos a preencher e o resultado esperado…" onChange={e => patch(selected.id, p => ({ steps: p.steps.map(s => s.id === step.id ? { ...s, description: e.target.value } : s) }))} />{step.frameId && selected.frames.find(f => f.id === step.frameId) && <button className="step-image" onClick={() => setLargeFrame(selected.frames.find(f => f.id === step.frameId)!)}><img src={selected.frames.find(f => f.id === step.frameId)!.image} alt={`Captura da etapa ${index + 1}`} /></button>}<label className="attach-frame"><ImagePlus size={14} /><select aria-label={`Captura da etapa ${index + 1}`} disabled={locked} value={step.frameId ?? ''} onChange={e => patch(selected.id, p => ({ steps: p.steps.map(s => s.id === step.id ? { ...s, frameId: e.target.value || undefined } : s) }))}><option value="">Sem captura associada</option>{selected.frames.map((f, i) => <option value={f.id} key={f.id}>Captura {i + 1} · {formatTime(f.at)}</option>)}</select></label></div></article>)}
              <button className="add-step" disabled={locked || selected.steps.length >= 500} onClick={() => patch(selected.id, p => ({ steps: [...p.steps, { id: crypto.randomUUID(), title: 'Nova etapa', description: '' }] }))}><Plus size={18} /> Adicionar etapa</button>
            </div>}
            {tab === 'voice' && <div className="tab-content"><div className="section-label"><h3>Narração original</h3><span>{pending > 0 ? `${pending} trecho(s) em processamento` : 'Transcrição local em português'}</span></div><p className="muted">A fala original fica preservada aqui. A versão profissional é apresentada para revisão antes de substituir as etapas.</p>{!selected.transcripts.length && <div className="empty-small"><Mic size={30} /><p>A narração aparecerá em trechos de aproximadamente 20 segundos, conforme o motor local concluir a transcrição.</p></div>}{selected.transcripts.map((t, i) => <div className="transcript" key={i}><span>{formatTime(t.start)}</span><p>{t.text}</p></div>)}{failedAudio.filter(c => c.id === selected.id).map((chunk, i) => <div className="failed-audio" key={i}><strong>Trecho {formatTime(chunk.start)} aguardando recuperação</strong><div><button className="secondary" disabled={locked} onClick={() => { setFailedAudio(all => all.filter(c => c !== chunk)); queueAudio(chunk.audio, chunk.start, chunk.end, chunk.id); }}>Tentar novamente</button><button className="secondary" onClick={() => { const url = URL.createObjectURL(new Blob([chunk.audio], { type: 'audio/wav' })); const a = document.createElement('a'); a.href = url; a.download = `narracao-${Math.floor(chunk.start)}.wav`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Salvar áudio WAV</button></div></div>)}</div>}
            {tab === 'references' && <div className="tab-content"><div className="section-label"><h3>Documentos de referência</h3><span>PDF, Word, TXT e Markdown</span></div><p className="muted">Importe orientações existentes para comparar e complementar o procedimento. PDFs digitalizados precisam de OCR externo.</p>{!selected.references.length && <div className="empty-small"><FolderOpen size={30} /><p>Os arquivos importados e seus textos extraídos aparecerão aqui.</p></div>}{selected.references.map(ref => <article className="reference-card" key={ref.id}><div><FileText size={21} /><strong>{ref.name}</strong><button className="icon-button" aria-label={`Remover ${ref.name}`} disabled={locked} onClick={() => { if (confirm('Remover este documento de referência?')) patch(selected.id, p => ({ references: p.references.filter(r => r.id !== ref.id) })); }}><Trash2 size={15} /></button></div><span>{ref.text.length.toLocaleString('pt-BR')} caracteres extraídos</span><details><summary>Ver texto do documento</summary><pre>{ref.text}</pre></details></article>)}</div>}
            {tab === 'review' && <div className="tab-content"><div className="section-label"><h3>Compare antes de padronizar</h3><FileCheck2 size={20} /></div><p className="muted">A IA local procura divergências e lacunas entre as instruções e os documentos importados. Revise as sugestões com o responsável pelo processo.</p><button className="secondary" disabled={locked || !selected.references.length} onClick={() => void run('Comparando documentos com IA local', async () => { const text = await api.review(selected); patch(selected.id, { review: text }); })}><WandSparkles size={17} /> Comparar com as referências</button>{selected.review ? <pre className="review-text">{selected.review}</pre> : <div className="empty-small"><FileCheck2 size={30} /><p>Importe uma referência e faça a primeira comparação.</p></div>}</div>}
          </div><aside className="editor-rail"><div className="rail-heading"><h3>Capturas de tela</h3><span>{selected.frames.length}</span></div><p className="muted">O destaque indica a região do cursor. Confira se corresponde ao campo ou botão correto.</p>{!selected.frames.length ? <div className="capture-placeholder"><Monitor size={35} /><strong>O contexto faz a diferença</strong><p>As imagens da sua demonstração aparecem aqui, na ordem da captura.</p></div> : <div className="frame-grid">{selected.frames.map((frame, index) => <div className="frame-card" key={frame.id}><button onClick={() => setLargeFrame(frame)}><img src={frame.image} alt={`Captura ${index + 1} em ${formatTime(frame.at)}`} /></button><div><span>{String(index + 1).padStart(2, '0')} <small>{formatTime(frame.at)}</small></span><button className="icon-button" aria-label={`Excluir captura ${index + 1}`} disabled={locked} onClick={() => { if (confirm('Excluir esta captura e removê-la das etapas associadas?')) patch(selected.id, p => ({ frames: p.frames.filter(f => f.id !== frame.id), steps: p.steps.map(s => s.frameId === frame.id ? { ...s, frameId: undefined } : s) })); }}><Trash2 size={13} /></button></div></div>)}</div>}<div className="rail-tip"><ShieldCheck size={20} /><strong>Revise antes de compartilhar</strong><p>Confira as instruções e remova capturas que exibam senhas, dados de clientes ou informações confidenciais.</p></div></aside></div>
        </> : <>
          <div className="page-heading"><div><div className="eyebrow">BIBLIOTECA DE PROCESSOS</div><h1>Todo o seu comercial.<br /><span>Na mesma página.</span></h1><p>Transforme a experiência da sua equipe em processos que todos podem seguir.</p></div><button className="primary" onClick={() => create()}><Plus size={18} /> Novo procedimento</button></div>
          <section className="welcome-card"><div className="welcome-copy"><span className="pill"><Sparkles size={13} /> DA PRÁTICA PARA O PLAYBOOK</span><h2>Você mostra como faz.<br />O conhecimento fica.</h2><p>Narre o processo no TBS. Registre as telas.<br />Crie instruções claras, com a sua experiência.</p><button className="text-button" onClick={() => setShowGuide(true)}>Conheça o fluxo de criação <ArrowRight size={16} /></button></div><div className="workflow-illustration" aria-hidden="true"><div className="mini-voice"><span className="mic-symbol"><Mic size={20} /></span><div><strong>“Primeiro, abra o cadastro…”</strong><div className="waveform">{Array.from({ length: 32 }, (_, i) => <i style={{ height: `${8 + ((i * 13) % 23)}px` }} key={i} />)}</div></div><span className="voice-time">00:12</span></div><div className="connector-line"><span /><WandSparkles size={16} /><span /></div><div className="mini-document"><div className="mini-check"><Check size={14} /></div><div><strong>01. Acesse o cadastro</strong><div className="fake-line" /><div className="fake-line short" /></div><div className="mini-screen"><div /><div className="highlight-box" /></div></div><span className="illustration-caption">Exemplo ilustrativo de um procedimento</span></div></section>
          <div className="stats-row"><div><span className="stat-icon"><BookOpen size={18} /></span><strong>{workspace.procedures.length.toString().padStart(2, '0')}</strong><span>procedimentos</span></div><div><span className="stat-icon violet"><Users size={18} /></span><strong>05</strong><span>cargos comerciais</span></div><div><span className="stat-icon amber"><FileText size={18} /></span><strong>{referencesCount.toString().padStart(2, '0')}</strong><span>documentos de referência</span></div><div className="stats-local"><LockKeyhole size={15} /> Tudo salvo localmente</div></div>
          <div className="library-layout"><section className="library"><div className="library-heading"><h2>Seus procedimentos <span>{filtered.length}</span></h2><label className="search"><Search size={16} /><input aria-label="Buscar procedimento" placeholder="Buscar procedimento…" value={search} onChange={e => setSearch(e.target.value)} /></label></div><div className="filter-row">{['Todos', ...roles].map(r => <button className={roleFilter === r ? 'chosen' : ''} key={r} onClick={() => setRoleFilter(r)}>{r}</button>)}</div>{!filtered.length ? <div className="empty-library"><div className="empty-library-icon"><BookOpen size={31} /><span><Plus size={13} /></span></div><h3>{search || roleFilter !== 'Todos' ? 'Nenhum procedimento por aqui ainda' : 'Seu primeiro processo começa aqui'}</h3><p>Do cadastro ao fechamento: documente uma rotina<br />e dê à equipe um caminho claro para seguir.</p><button className="secondary" onClick={() => create()}><Plus size={16} /> Criar procedimento</button><div className="starter-label">PRECISA DE UM PONTO DE PARTIDA?</div><div className="starter-actions"><button onClick={() => create('Criar cadastro de cliente no TBS', 'Cadastros')}>Cadastro de cliente <ArrowRight size={13} /></button><button onClick={() => create('Criar pedido de venda no TBS', 'Pedidos')}>Pedido de venda <ArrowRight size={13} /></button></div></div> : <div className="procedure-grid">{filtered.map((p, i) => <article className="procedure-card" key={p.id}><div className="procedure-card-top"><span className={`procedure-icon color-${i % 5}`}><FileText size={21} /></span><button className="icon-button" aria-label={`Excluir ${p.title}`} onClick={() => { if (confirm(`Excluir “${p.title}” e todas as suas etapas?`)) setWorkspace(w => w ? { ...w, procedures: w.procedures.filter(item => item.id !== p.id) } : w); }}><Trash2 size={15} /></button></div><button className="procedure-open" onClick={() => { setSelectedId(p.id); setTab('steps'); setUndo(null); }}><span className="category-label">{p.category}</span><h3>{p.title}</h3><p>{p.objective || 'Adicione um objetivo e documente este processo.'}</p><span className="procedure-role"><Users size={13} />{p.role}</span><footer><span>{p.steps.length} etapas · {p.frames.length} capturas</span><ArrowRight size={16} /></footer></button></article>)}</div>}</section><aside className="getting-started"><span className="guide-icon"><ListOrdered size={22} /></span><h3>Da experiência<br />ao processo.</h3><p>Um jeito simples de registrar<br />o que sua equipe sabe.</p><ol><li><span>1</span><div><strong>Mostre e explique</strong><p>Abra o TBS e narre cada ação enquanto usa o sistema.</p></div></li><li><span>2</span><div><strong>Organize e revise</strong><p>Associe capturas, refine o texto e compare suas referências.</p></div></li><li><span>3</span><div><strong>Compartilhe o padrão</strong><p>Exporte para PDF ou Word e leve o processo à sua equipe.</p></div></li></ol><button onClick={openSettings}><span className={settings.configured ? 'tiny-dot green' : 'tiny-dot'} />{settings.configured ? 'IA local configurada' : 'Preparar minha IA offline'}<ArrowRight size={14} /></button></aside></div>
          <footer className="page-footer"><ShieldCheck size={14} /> Criado para o seu comercial. Mantido no seu computador.<span>Windows 10 e 11 · 64 bits</span></footer>
        </>}
      </main>
    </div>
    {notice && <div className={`toast ${notice.error ? 'toast-error' : ''}`} role={notice.error ? 'alert' : 'status'}><span>{notice.text}</span><button className="icon-button" aria-label="Fechar aviso" onClick={() => setNotice(null)}><X size={17} /></button></div>}
    {showSettings && <Modal title="Sua IA, no seu computador" close={() => { if (!busy) setShowSettings(false); }}><p className="modal-intro">Nenhuma chave de API ou assinatura. Selecione os motores e modelos já baixados ou transferidos para este computador.</p><div className="offline-info"><ShieldCheck size={20} /><div><strong>Processamento totalmente local</strong><p>Áudio com whisper.cpp e redação com llama.cpp. O aplicativo não faz chamadas a serviços externos. A preparação inicial dos modelos pode ser feita em outra máquina.</p></div></div><div className="settings-links"><button className="secondary" disabled={Boolean(busy)} onClick={() => void run('Abrindo arquivos de preparação', () => api.openFolder('resources'))}><FolderOpen size={15} /> Guia e preparação da IA</button><button className="secondary" disabled={Boolean(busy)} onClick={() => void run('Abrindo pasta de dados', () => api.openFolder('data'))}><FolderOpen size={15} /> Dados e recuperação</button></div><div className="settings-fields">{([['whisperExecutable', 'Motor de voz · whisper-cli.exe', 'executable'], ['whisperModel', 'Modelo de voz · ggml-small.bin (multilíngue)', 'whisper'], ['llamaExecutable', 'Motor de texto · llama-server.exe', 'executable'], ['llamaModel', 'Modelo de texto · Qwen2.5 Instruct GGUF', 'llama']] as const).map(([key, label, kind]) => <label key={key}>{label}<div className="file-field"><input aria-label={label} readOnly value={settingsForm[key]} placeholder="Nenhum arquivo selecionado" /><button className="secondary" disabled={Boolean(busy)} onClick={() => void run('Selecionando arquivo', async () => { const file = await api.chooseEngineFile(kind); if (file) setSettingsForm(f => ({ ...f, [key]: file })); })}><FolderOpen size={16} /> Escolher</button></div></label>)}<label>Threads de CPU<select value={settingsForm.threads} disabled={Boolean(busy)} onChange={e => setSettingsForm(f => ({ ...f, threads: Number(e.target.value) }))}>{[1, 2, 4, 6, 8, 12, 16].map(n => <option value={n} key={n}>{n} threads</option>)}</select></label></div><p className="muted small">Recomendado: Windows 10/11 x64, 16 GB de RAM e modelo Qwen2.5 3B Instruct Q4_K_M. Preserve as DLLs junto aos executáveis. Veja as instruções de instalação no README do projeto. A velocidade depende do computador.</p>{busy && <div className="processing-banner"><LoaderCircle size={16} className="spin" />{busy}…</div>}<div className="modal-actions"><button className="secondary" disabled={Boolean(busy)} onClick={() => setShowSettings(false)}>Fechar</button><button className="secondary" disabled={Boolean(busy) || !settings.configured} onClick={() => void run('Carregando e testando o modelo local', async () => { await api.testConnection(); setSettings(s => ({ ...s, running: true })); notify('Motor de texto local carregado. A transcrição será verificada com uma gravação de áudio.'); })}>Testar motor de texto</button><button className="primary" disabled={Boolean(busy) || !settingsForm.whisperExecutable || !settingsForm.whisperModel || !settingsForm.llamaExecutable || !settingsForm.llamaModel} onClick={() => void run('Salvando configuração', async () => { const s = await api.configure(settingsForm); setSettings(s); notify('Configuração da IA local salva. Teste o motor de texto e faça uma gravação curta.'); })}><Check size={17} /> Salvar</button></div></Modal>}
    {showGuide && <Modal title="Como criar seu playbook" close={() => setShowGuide(false)}><div className="guide-content"><p>Comece por uma rotina curta: cadastrar um cliente ou criar um pedido. Escolha o cargo responsável e um título específico.</p><ol><li><strong>Prepare a IA offline.</strong> Baixe os motores e modelos uma vez, ou receba os arquivos por transferência. Selecione-os em Configurações. A edição manual e a captura de tela funcionam sem IA.</li><li><strong>Grave uma demonstração.</strong> Escolha o monitor e o microfone. A janela será minimizada. Abra o TBS e explique cada ação, parando o mouse sobre o campo ou botão por aproximadamente 1 segundo.</li><li><strong>Capture e encerre.</strong> Use Ctrl + Shift + Espaço para capturar manualmente e Ctrl + Shift + Enter para encerrar. Se o atalho estiver ocupado, retorne ao aplicativo e use Encerrar.</li><li><strong>Revise as etapas.</strong> A narração é transcrita em trechos. Ao encerrar, a IA propõe um texto profissional. Revise antes de aplicar e confira a associação de cada captura.</li><li><strong>Complete o material.</strong> Importe PDF, Word (.docx), TXT ou Markdown e use a comparação para encontrar diferenças. PDFs de imagem precisam de OCR externo.</li><li><strong>Exporte.</strong> Salve o procedimento em PDF ou Word com as capturas anexadas a cada etapa.</li></ol><p className="muted">As capturas mostram a região do cursor; o aplicativo não interpreta os campos do TBS nem acessa seu banco de dados. A identificação da empresa permanece confidencial.</p></div></Modal>}
    {displays && <Modal title="Gravar uma demonstração" close={() => { if (!busy) setDisplays(null); }} wide><p className="modal-intro">Escolha o monitor com o TBS. Toda a área dessa tela poderá aparecer nas capturas.</p><div className="display-options">{displays.map(d => <button className={displayId === d.id ? 'selected' : ''} key={d.id} onClick={() => setDisplayId(d.id)}><img src={d.thumbnail} alt={d.name} /><span><Monitor size={16} />{d.name}{displayId === d.id && <Check size={16} />}</span></button>)}</div><label className="check-field"><input type="checkbox" checked={useVoice} disabled={!settings.configured} onChange={e => setUseVoice(e.target.checked)} />Gravar narração e transcrever com IA local</label>{!settings.configured && <p className="muted">A IA ainda não foi configurada. Você pode capturar as telas e escrever as instruções manualmente.</p>}{useVoice && <label className="mic-field">Microfone<select value={microphoneId} onChange={e => setMicrophoneId(e.target.value)}><option value="">Microfone padrão do Windows</option>{microphones.filter(m => m.deviceId !== 'default').map((m, i) => <option value={m.deviceId} key={m.deviceId}>{m.label || `Microfone ${i + 1}`}</option>)}</select></label>}<div className="record-shortcuts"><span><kbd>Ctrl Shift Espaço</kbd> Capturar tela</span><span><kbd>Ctrl Shift Enter</kbd> Encerrar</span></div><p className="muted small">A janela será minimizada. Os destaques marcam a região do mouse. Máximo de 120 capturas por sessão. Feche informações confidenciais antes de começar.</p><div className="modal-actions"><button className="secondary" onClick={() => setDisplays(null)} disabled={Boolean(busy)}>Cancelar</button><button className="primary" disabled={Boolean(busy) || !displayId} onClick={() => void startRecording()}>{busy ? <LoaderCircle className="spin" size={17} /> : <Mic size={17} />} Iniciar gravação</button></div></Modal>}
    {generated && <Modal title="Revise a proposta da IA local" close={() => setGenerated(null)} wide><p className="modal-intro">Confira as instruções, os termos usados no TBS e as capturas associadas. Aplicar substitui as etapas atuais; você poderá desfazer enquanto este procedimento estiver aberto.</p><div className="generated-preview"><h3>Objetivo</h3><p>{generated.objective}</p>{generated.steps.map((s, i) => <article key={s.id}><h3>{i + 1}. {s.title}</h3><p>{s.description}</p><small>{s.frameId ? 'Captura associada — confira no editor' : 'Sem captura associada'}</small></article>)}</div><div className="modal-actions"><button className="secondary" onClick={() => setGenerated(null)}>Manter versão atual</button><button className="primary" onClick={() => { const original = data.current?.procedures.find(p => p.id === generated.id); if (original) { setUndo({ id: original.id, objective: original.objective, steps: original.steps }); patch(original.id, { objective: generated.objective, steps: generated.steps }); } setGenerated(null); setTab('steps'); notify('Proposta aplicada. Revise as etapas antes de compartilhar.'); }}><Check size={17} /> Aplicar ao procedimento</button></div></Modal>}
    {largeFrame && <Modal title={`Captura · ${formatTime(largeFrame.at)}`} close={() => setLargeFrame(null)} wide><img className="large-frame" src={largeFrame.image} alt="Captura ampliada com destaque na região do cursor" /><p className="muted small">O destaque marca a região em que o mouse estava. Confirme a correspondência com a instrução.</p></Modal>}
    {exportOpen && selected && <Modal title="Compartilhe o procedimento" close={() => { if (!busy) setExportOpen(false); }}><p className="modal-intro">O arquivo inclui título, cargo, objetivo, etapas e as capturas associadas. Os documentos de referência e a narração original ficam na biblioteca.</p><div className="export-options">{(['pdf', 'docx'] as const).map(format => <button key={format} disabled={Boolean(busy)} onClick={() => void run('Exportando documento', async () => { const saved = await api.exportDocument(selected, format); if (saved) { setExportOpen(false); notify(`${format === 'pdf' ? 'PDF' : 'Word'} exportado com sucesso.`); } })}><span className={`export-icon ${format}`}><FileText size={28} /></span><strong>{format === 'pdf' ? 'Documento PDF' : 'Documento Word'}</strong><p>{format === 'pdf' ? 'Pronto para leitura e compartilhamento.' : 'Editável, para ajustes e colaboração.'}</p><span>Salvar .{format} <ArrowRight size={15} /></span></button>)}</div>{busy && <div className="processing-banner"><LoaderCircle size={16} className="spin" />{busy}…</div>}</Modal>}
  </div>;
}
