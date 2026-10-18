import { useRef, useState } from 'react';
import type { Frame, MarkStyle } from '../shared/types';
import { annotateFrame } from './recorder';

export function FrameEditor({ frame, disabled, save, error }: { frame: Frame; disabled: boolean; save: (frame: Frame) => void; error: (error: unknown) => void }) {
  const [adjust, setAdjust] = useState(false);
  const [region, setRegion] = useState<Frame['target']>();
  const start = useRef<{x:number;y:number} | undefined>(undefined);
  const [working, setWorking] = useState(false);
  async function mark(style: MarkStyle, color = frame.annotation?.color ?? '#f59e0b', target = frame.target, manuallyAdjusted = frame.manuallyAdjusted) {
    setWorking(true);
    try { save(await annotateFrame({ ...frame, target, manuallyAdjusted }, style, color)); } catch(e) { error(e); }
    finally { setWorking(false); }
  }
  const locked = disabled || working || !frame.originalImage;
  return <>
    <div style={{ position: 'relative', width: `min(100%, ${55*frame.width/frame.height}vh)`, margin: '0 auto', touchAction: adjust ? 'none' : 'auto' }}
      onPointerDown={e => { if (!adjust || locked) return; const r=e.currentTarget.getBoundingClientRect(); const p={x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height}; start.current=p; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={e => { if (!start.current) return; const r=e.currentTarget.getBoundingClientRect(); const x=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height)); setRegion({x:Math.min(x,start.current.x),y:Math.min(y,start.current.y),width:Math.abs(x-start.current.x),height:Math.abs(y-start.current.y)}); }}
      onPointerUp={e => {
        const from=start.current; if (!from) return;
        const r=e.currentTarget.getBoundingClientRect();
        const x=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)), y=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));
        const target={ x:Math.min(x,from.x), y:Math.min(y,from.y), width:Math.abs(x-from.x), height:Math.abs(y-from.y) };
        start.current=undefined;
        if(target.width>.003 && target.height>.003) void mark(frame.annotation?.style ?? 'highlight', undefined, target, true);
        setRegion(undefined); setAdjust(false);
      }}
      onPointerCancel={() => { start.current=undefined; setRegion(undefined); }}>
      <img className="large-frame" style={{ display:'block', maxHeight:'none', cursor:adjust?'crosshair':'default' }} draggable={false} src={frame.image} alt="Captura com destaque da ação" />
      {region && <div style={{ position:'absolute', pointerEvents:'none', border:'2px dashed #e68a00', background:'#ffcb4533', left:`${region.x*100}%`,top:`${region.y*100}%`,width:`${region.width*100}%`,height:`${region.height*100}%` }} />}
    </div>
    <p className="muted small">{frame.manuallyAdjusted ? 'Região ajustada manualmente.' : frame.action?.detection === 'uia' ? `Controle identificado pelo Windows: ${frame.action.controlName || frame.action.controlType}` : 'Controle não identificado. Destaque aproximado da região do clique.'} Confira a correspondência com a instrução.</p>
    <div className="settings-links">{(['smart','highlight','circle','underline'] as const).map((style,i) => <button className="secondary" disabled={locked} key={style} onClick={() => void mark(style)}>{['Inteligente','Grifar','Circular','Sublinhar'][i]}</button>)}<label>Cor <input type="color" aria-label="Cor deste destaque" value={frame.annotation?.color ?? '#f59e0b'} disabled={locked} onChange={e => void mark(frame.annotation?.style ?? 'smart',e.target.value)} /></label><button className="secondary" disabled={locked} onClick={() => setAdjust(!adjust)}>{adjust ? 'Cancelar ajuste' : 'Ajustar região'}</button></div>
    {adjust && <p>Arraste sobre o print para delimitar o botão ou campo.</p>}
    {!frame.originalImage && <p className="muted small">Captura de versão anterior: a imagem original não está disponível para refazer o destaque.</p>}
  </>;
}
