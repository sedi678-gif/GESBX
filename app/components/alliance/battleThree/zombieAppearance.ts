import type { Object3D } from 'three';
import { applyHeroAppearance } from './heroAppearance';

/** Geriyə uyğunluq — zombi paltarı heroAppearance-dədir. */
export function applyZombieAppearance(root: Object3D): void {
  applyHeroAppearance(root, 'zombi');
}
