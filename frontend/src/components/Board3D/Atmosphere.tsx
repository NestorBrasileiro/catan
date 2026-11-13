import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, Sky, Stars } from '@react-three/drei';
import { SpriteMaterial, Vector3, type Group, type WebGLRenderer } from 'three';
import type { QualityProfile, TimeOfDay } from '../../services/graphics';
import { seededRandom } from './layout';
import { setNightGlow } from './materials';
import { cloudTexture } from './textures';

interface Lighting {
  elevation: number; // degrees above the horizon
  azimuth: number;   // radians, 0 = from the camera's default side (south), towards +x (east)
  sunColor: string;
  sunIntensity: number;
  skyLight: string;
  groundLight: string;
  hemiIntensity: number;
  envIntensity: number;
  fog: string;
  exposure: number;
  sky: { turbidity: number; rayleigh: number; mieCoefficient: number; mieDirectionalG: number } | null;
}

const LIGHTING: Record<TimeOfDay, Lighting> = {
  dawn: {
    elevation: 9, azimuth: 1.25, sunColor: '#ffc89a', sunIntensity: 2.2, skyLight: '#ffd8bd', groundLight: '#3d4636',
    hemiIntensity: 0.55, envIntensity: 0.75, fog: '#d7c2b6', exposure: 0.85,
    sky: { turbidity: 5, rayleigh: 2.2, mieCoefficient: 0.006, mieDirectionalG: 0.86 },
  },
  day: {
    elevation: 52, azimuth: 0.65, sunColor: '#fff4e2', sunIntensity: 3.2, skyLight: '#cfe6ff', groundLight: '#4d6a43',
    hemiIntensity: 0.7, envIntensity: 0.9, fog: '#b9d3ea', exposure: 1,
    sky: { turbidity: 2.6, rayleigh: 0.9, mieCoefficient: 0.004, mieDirectionalG: 0.8 },
  },
  sunset: {
    elevation: 5, azimuth: 2.55, sunColor: '#ff9a5a', sunIntensity: 2.6, skyLight: '#ffb08a', groundLight: '#33283a',
    hemiIntensity: 0.5, envIntensity: 0.8, fog: '#d59a80', exposure: 0.9,
    sky: { turbidity: 7, rayleigh: 2.8, mieCoefficient: 0.009, mieDirectionalG: 0.9 },
  },
  night: {
    elevation: 38, azimuth: -0.7, sunColor: '#9db6ff', sunIntensity: 0.9, skyLight: '#3b4f86', groundLight: '#0b0f1a',
    hemiIntensity: 0.55, envIntensity: 0.35, fog: '#0c1528', exposure: 1.1,
    sky: null,
  },
};

function sunDirection(light: Lighting) {
  const el = (light.elevation * Math.PI) / 180;
  return new Vector3(Math.cos(el) * Math.sin(light.azimuth), Math.sin(el), Math.cos(el) * Math.cos(light.azimuth));
}

let clouds: SpriteMaterial | null = null;
function cloudMaterial() {
  return (clouds ??= new SpriteMaterial({ map: cloudTexture(), transparent: true, depthWrite: false, fog: true, opacity: 0.85 }));
}
function tintClouds(night: boolean) {
  cloudMaterial().color.set(night ? '#46506e' : '#ffffff');
  cloudMaterial().opacity = night ? 0.35 : 0.85;
}
function setExposure(renderer: WebGLRenderer, exposure: number) {
  renderer.toneMappingExposure = exposure;
}

// A few puffs drifting far around the island, never over the board itself
function Clouds({ night }: { night: boolean }) {
  const group = useRef<Group>(null);
  const material = cloudMaterial();
  useEffect(() => tintClouds(night), [night]);

  const puffs = useMemo(() => {
    const random = seededRandom(12);
    return Array.from({ length: 26 }, () => {
      const angle = random() * Math.PI * 2;
      const radius = 14 + random() * 45;
      return {
        x: Math.cos(angle) * radius, z: Math.sin(angle) * radius,
        y: 6 + random() * 9, scale: 9 + random() * 14, speed: 0.15 + random() * 0.25,
      };
    });
  }, []);

  useFrame((_, delta) => {
    group.current?.children.forEach((sprite, i) => {
      sprite.position.x += delta * puffs[i].speed;
      if (sprite.position.x > 70) sprite.position.x = -70;
    });
  });

  return (
    <group ref={group}>
      {puffs.map((p, i) => (
        <sprite key={i} material={material} position={[p.x, p.y, p.z]} scale={[p.scale, p.scale * 0.55, 1]} />
      ))}
    </group>
  );
}

interface AtmosphereProps {
  time: TimeOfDay;
  profile: QualityProfile;
  clouds: boolean;
}

// Physically based sky for the time of day, the same sky lighting the scene (reflections on the sea and
// the pieces), the sun or moon casting shadows, and fog that melts the sea into the horizon
export default function Atmosphere({ time, profile, clouds }: AtmosphereProps) {
  const light = LIGHTING[time];
  const sun = useMemo(() => sunDirection(light), [light]);
  const sunPosition = useMemo(() => sun.clone().multiplyScalar(400), [sun]);
  const { gl } = useThree();

  useEffect(() => {
    setExposure(gl, light.exposure);
    setNightGlow(time === 'night' ? 1 : time === 'sunset' || time === 'dawn' ? 0.35 : 0);
  }, [gl, light, time]);

  const shadowSize = profile.shadows;
  return (
    <>
      {light.sky
        ? <Sky distance={450} sunPosition={sunPosition} {...light.sky} />
        : <color attach="background" args={['#070c1a']} />}
      {time === 'night' && <Stars radius={180} depth={80} count={5000} factor={5} saturation={0.2} fade speed={0.4} />}
      <fog attach="fog" args={[light.fog, 40, 190]} />

      <Environment key={`${time}-${profile.envResolution}`} resolution={profile.envResolution} frames={1}
        environmentIntensity={light.envIntensity}>
        {light.sky
          ? <Sky distance={450} sunPosition={sunPosition} {...light.sky} />
          : (
            <>
              <color attach="background" args={['#0a1226']} />
              <Lightformer form="circle" intensity={2} color="#b8c8ff" position={sun.clone().multiplyScalar(10)} scale={3} />
              <Lightformer form="ring" intensity={0.6} color="#ffb070" position={[0, -4, 0]} scale={8} />
            </>
          )}
      </Environment>

      <hemisphereLight args={[light.skyLight, light.groundLight, light.hemiIntensity]} />
      <directionalLight
        key={shadowSize}
        position={sun.clone().multiplyScalar(22).toArray()}
        color={light.sunColor}
        intensity={light.sunIntensity}
        castShadow={shadowSize > 0}
        shadow-mapSize={[shadowSize || 512, shadowSize || 512]}
        shadow-camera-left={-8.5}
        shadow-camera-right={8.5}
        shadow-camera-top={8.5}
        shadow-camera-bottom={-8.5}
        shadow-camera-near={1}
        shadow-camera-far={60}
        shadow-bias={-0.0002}
        shadow-normalBias={0.025}
      />
      {clouds && <Clouds night={time === 'night'} />}
    </>
  );
}
