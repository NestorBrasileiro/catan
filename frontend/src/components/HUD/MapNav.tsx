import { useEffect, useRef, useState } from 'react';
import { onPose, sendCameraCommand } from '../Board3D/cameraBus';
import { MinusIcon, PlusIcon, TargetIcon } from './icons';

// Zoom, compass and tilt, like the navigation control of a web map
export default function MapNav() {
  const needle = useRef<SVGSVGElement>(null);
  const [flat, setFlat] = useState(false);

  // The compass follows the camera without re-rendering React on every frame
  useEffect(() => onPose(pose => {
    if (needle.current) needle.current.style.transform = `rotate(${pose.heading}rad)`;
    setFlat(pose.tilt < 0.15);
  }), []);

  return (
    <nav className="map-nav" aria-label="Navegação do mapa">
      <div className="control-group glass">
        <button className="icon-btn" onClick={() => sendCameraCommand('zoomIn')} aria-label="Aproximar" title="Aproximar">
          <PlusIcon />
        </button>
        <button className="icon-btn" onClick={() => sendCameraCommand('zoomOut')} aria-label="Afastar" title="Afastar">
          <MinusIcon />
        </button>
        <button className="icon-btn" onClick={() => sendCameraCommand('north')}
          aria-label="Voltar para o norte" title="Voltar para o norte (arraste com o botão direito para girar)">
          <svg ref={needle} className="compass" viewBox="0 0 20 20" width="20" height="20" aria-hidden>
            <path d="M10 2.5 13 10h-6z" fill="#f0576a" />
            <path d="M10 17.5 7 10h6z" fill="currentColor" opacity="0.55" />
          </svg>
        </button>
      </div>
      <div className="control-group glass">
        <button className="icon-btn text" onClick={() => sendCameraCommand('tilt')}
          aria-label={flat ? 'Inclinar a câmera (3D)' : 'Ver de cima (2D)'} title={flat ? 'Inclinar a câmera' : 'Ver de cima'}>
          {flat ? '3D' : '2D'}
        </button>
        <button className="icon-btn" onClick={() => sendCameraCommand('recenter')} aria-label="Centralizar a ilha" title="Centralizar a ilha">
          <TargetIcon />
        </button>
      </div>
    </nav>
  );
}
