import { Bloom, EffectComposer, N8AO, SMAA, TiltShift2, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import type { JSX } from 'react';
import type { QualityPreset, QualityProfile, TimeOfDay } from '../../services/graphics';

interface EffectsProps {
  preset: QualityPreset;
  profile: QualityProfile;
  time: TimeOfDay;
  cinematic: boolean;
}

// Film-like finish: ambient occlusion in the creases, glow on bright things, filmic tone mapping
export default function Effects({ preset, profile, time, cinematic }: EffectsProps) {
  const night = time === 'night';
  const effects: JSX.Element[] = [];
  if (profile.ambientOcclusion) {
    effects.push(
      <N8AO key="ao" aoRadius={0.55} distanceFalloff={0.6} intensity={night ? 1.6 : 2.6}
        quality={preset === 'ultra' ? 'high' : 'medium'} halfRes={preset !== 'ultra'} />,
    );
  }
  if (profile.bloom) {
    effects.push(
      <Bloom key="bloom" mipmapBlur luminanceThreshold={night ? 0.55 : 0.92} luminanceSmoothing={0.2}
        intensity={night ? 1.4 : 0.45} radius={0.7} />,
    );
  }
  if (cinematic) effects.push(<TiltShift2 key="tilt" blur={0.12} taper={0.6} start={[0.5, 0.0]} end={[0.5, 1.0]} />);
  effects.push(<ToneMapping key="tone" mode={ToneMappingMode.NEUTRAL} />);
  effects.push(<Vignette key="vignette" offset={0.28} darkness={night ? 0.65 : 0.42} />);
  if (profile.multisampling === 0) effects.push(<SMAA key="smaa" />);

  return (
    <EffectComposer multisampling={profile.multisampling} enableNormalPass={false}>
      {effects}
    </EffectComposer>
  );
}
