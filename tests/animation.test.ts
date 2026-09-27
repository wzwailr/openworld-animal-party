import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { selectPreferredClip } from '../src/entities/animation.ts';

test('selectPreferredClip chooses Conduct before unrelated clips', () => {
  const clips = [
    new THREE.AnimationClip('Walk', 1, []),
    new THREE.AnimationClip('Conduct', 2, [])
  ];

  assert.equal(selectPreferredClip(clips, ['Conduct', 'Idle']), clips[1]);
});

test('selectPreferredClip falls back to the first available clip', () => {
  const clips = [new THREE.AnimationClip('Walking', 1, [])];

  assert.equal(selectPreferredClip(clips, ['Conduct']), clips[0]);
  assert.equal(selectPreferredClip([], ['Conduct']), null);
});
