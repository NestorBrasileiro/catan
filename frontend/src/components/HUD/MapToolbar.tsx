import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  LAYER_LABELS, QUALITY_LABELS, QUALITY_PROFILES, TIME_LABELS, updateGraphics, useGraphics,
  type MapLayers, type QualityChoice, type QualityPreset, type TimeOfDay,
} from '../../services/graphics';
import { isMuted, playSound, setMuted } from '../../services/sound';
import { getStats, subscribeStats } from '../Board3D/cameraBus';
import { FullscreenIcon, HelpIcon, LayersIcon, SlidersIcon, SoundIcon } from './icons';

type Popover = 'layers' | 'graphics' | null;

function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="switch-row">
      <span className="switch-text">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="switch" aria-hidden />
    </label>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string; title?: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button key={o.value} role="radio" aria-checked={value === o.value} title={o.title}
          className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const TIME_ICONS: Record<TimeOfDay, string> = { dawn: '🌅', day: '☀️', sunset: '🌇', night: '🌙' };
const LAYER_ICONS: Record<keyof MapLayers, string> = {
  numbers: '🔢', heatmap: '📊', labels: '🏷️', ports: '⚓', scenery: '🌲', clouds: '☁️',
};

function LayersPanel() {
  const settings = useGraphics();
  return (
    <div className="popover glass" role="dialog" aria-label="Camadas do mapa">
      <h4>Visualização</h4>
      <Segmented label="Visualização" value={settings.view} onChange={view => updateGraphics({ view })}
        options={[{ value: '3d', label: 'Mapa 3D' }, { value: '2d', label: 'Plano 2D' }]} />
      <h4>Camadas</h4>
      <div className="layer-grid">
        {(Object.keys(LAYER_LABELS) as (keyof MapLayers)[]).map(key => {
          const on = settings.layers[key];
          const disabled = settings.view === '2d' && key !== 'numbers';
          return (
            <button key={key} className={`layer-tile ${on ? 'on' : ''}`} aria-pressed={on} disabled={disabled}
              title={LAYER_LABELS[key].hint} onClick={() => updateGraphics({ layers: { [key]: !on } })}>
              <span className="layer-icon" aria-hidden>{LAYER_ICONS[key]}</span>
              <span>{LAYER_LABELS[key].label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GraphicsPanel() {
  const settings = useGraphics();
  const stats = useSyncExternalStore(subscribeStats, getStats);
  const effective = (stats.preset || 'high') as QualityPreset;
  const shown: QualityPreset = settings.quality === 'auto' ? effective : settings.quality;
  const profile = QUALITY_PROFILES[shown];
  const features = [
    profile.shadows ? `sombras ${profile.shadows >= 4096 ? '4K' : profile.shadows >= 2048 ? '2K' : '1K'}` : 'sem sombras',
    profile.ambientOcclusion && 'oclusão de ambiente',
    profile.bloom && 'brilho',
    profile.reflections && 'reflexos no mar',
    profile.multisampling ? `MSAA ${profile.multisampling}×` : profile.postprocessing && 'SMAA',
  ].filter(Boolean).join(' · ');

  return (
    <div className="popover glass" role="dialog" aria-label="Gráficos">
      <h4>Qualidade</h4>
      <Segmented<QualityChoice> label="Qualidade gráfica" value={settings.quality} onChange={quality => updateGraphics({ quality })}
        options={(['auto', 'low', 'medium', 'high', 'ultra'] as QualityChoice[]).map(q => ({
          value: q, label: QUALITY_LABELS[q].label, title: QUALITY_LABELS[q].hint,
        }))} />
      <p className="popover-note">
        {settings.quality === 'auto' && <><strong>{QUALITY_LABELS[shown].label}</strong> agora · </>}
        {features}
      </p>

      <h4>Hora do dia</h4>
      <Segmented<TimeOfDay> label="Hora do dia" value={settings.timeOfDay} onChange={timeOfDay => updateGraphics({ timeOfDay })}
        options={(Object.keys(TIME_LABELS) as TimeOfDay[]).map(t => ({ value: t, label: TIME_ICONS[t], title: TIME_LABELS[t] }))} />
      <p className="popover-note">{TIME_LABELS[settings.timeOfDay]}</p>

      <h4>Efeitos</h4>
      <Switch label="Modo cinema" hint="Desfoque de miniatura nas bordas" checked={settings.cinematic}
        onChange={cinematic => updateGraphics({ cinematic })} />
      <Switch label="Mostrar FPS" checked={settings.showFps} onChange={showFps => updateGraphics({ showFps })} />
      {settings.showFps && <p className="popover-note fps">{stats.fps || '–'} FPS</p>}
    </div>
  );
}

function useBrowserFullscreen() {
  const [active, setActive] = useState(() => document.fullscreenElement !== null);
  useEffect(() => {
    const sync = () => setActive(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggle = () => {
    const change = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    change.catch(() => {}); // the browser may refuse; the page just stays as it is
  };
  return { active, toggle, available: document.fullscreenEnabled };
}

interface MapToolbarProps {
  onHelp?: () => void;
  sound?: boolean;
  children?: ReactNode; // extra buttons (e.g. the side panel on phones)
}

// Top-right controls: map layers, graphics, help, sound and full screen
export default function MapToolbar({ onHelp, sound = false, children }: MapToolbarProps) {
  const [open, setOpen] = useState<Popover>(null);
  const [muted, setMutedState] = useState(isMuted);
  const fullscreen = useBrowserFullscreen();
  const root = useRef<HTMLDivElement>(null);

  // Click outside or Esc closes the open panel
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const toggleSound = () => {
    setMuted(!muted);
    setMutedState(!muted);
    if (muted) playSound('card'); // a sample, so the player hears it's back on
  };
  const toggle = (which: Popover) => setOpen(open === which ? null : which);

  return (
    <div className="map-toolbar" ref={root}>
      <div className="control-group row glass">
        <button className={`icon-btn ${open === 'layers' ? 'on' : ''}`} onClick={() => toggle('layers')}
          aria-label="Camadas do mapa" title="Camadas do mapa" aria-expanded={open === 'layers'}><LayersIcon /></button>
        <button className={`icon-btn ${open === 'graphics' ? 'on' : ''}`} onClick={() => toggle('graphics')}
          aria-label="Gráficos" title="Gráficos" aria-expanded={open === 'graphics'}><SlidersIcon /></button>
        {onHelp && <button className="icon-btn" onClick={onHelp} aria-label="Como jogar" title="Como jogar"><HelpIcon /></button>}
        {sound && (
          <button className="icon-btn" onClick={toggleSound} aria-label={muted ? 'Ligar som' : 'Desligar som'}
            title={muted ? 'Ligar som' : 'Desligar som'}><SoundIcon muted={muted} /></button>
        )}
        {fullscreen.available && (
          <button className="icon-btn" onClick={fullscreen.toggle}
            aria-label={fullscreen.active ? 'Sair da tela cheia' : 'Tela cheia'} title={fullscreen.active ? 'Sair da tela cheia' : 'Tela cheia'}>
            <FullscreenIcon active={fullscreen.active} />
          </button>
        )}
        {children}
      </div>
      {open === 'layers' && <LayersPanel />}
      {open === 'graphics' && <GraphicsPanel />}
    </div>
  );
}
