import type * as THREE from 'three';

/** Select the first requested clip name, then fall back to the asset's first clip. */
export function selectPreferredClip(
  clips: readonly THREE.AnimationClip[],
  preferredNames: readonly string[]
): THREE.AnimationClip | null {
  for (const preferredName of preferredNames) {
    const normalizedName = preferredName.toLocaleLowerCase();
    const match = clips.find((clip) => clip.name.toLocaleLowerCase() === normalizedName);
    if (match) return match;
  }
  return clips[0] ?? null;
}
