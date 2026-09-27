import type { QualityTier } from './types';

const TIERS: readonly QualityTier[] = ['high', 'medium', 'low'];

export interface QualityMonitor {
  readonly tier: QualityTier;
  pushFrame(frameMs: number): void;
}

export function createQualityMonitor(
  onTierChange: (tier: QualityTier) => void,
  { sampleSize = 90, slowMs = 28 } = {}
): QualityMonitor {
  let tierIndex = 0;
  let samples: number[] = [];

  return {
    get tier() {
      return TIERS[tierIndex];
    },
    pushFrame(frameMs: number) {
      samples.push(frameMs);
      if (samples.length < sampleSize) return;

      const average = samples.reduce((total, sample) => total + sample, 0) / samples.length;
      samples = [];
      if (average > slowMs && tierIndex < TIERS.length - 1) {
        tierIndex += 1;
        onTierChange(TIERS[tierIndex]);
      }
    }
  };
}
