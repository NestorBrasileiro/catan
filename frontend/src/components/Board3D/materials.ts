import { MeshStandardMaterial } from 'three';

// Windows glow at dusk and at night (the bloom effect turns them into warm halos)
export const WINDOW_LIGHT = new MeshStandardMaterial({ color: '#2b2116', emissive: '#ffb04a', emissiveIntensity: 0, roughness: 0.4 });

export function setNightGlow(amount: number) {
  WINDOW_LIGHT.emissiveIntensity = amount * 5;
}
