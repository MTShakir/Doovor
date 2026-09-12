import { describe, expect, it } from 'vitest';
import {
  avatarImage,
  badgeImage,
  centreCrop,
  fitWithin,
  isAcceptedImageType,
  isProfileObjectPath,
  profileObjectPath,
} from './images.ts';

const profile = '3f2a1b4c-5d6e-4f70-8192-a3b4c5d6e7f8';
const token = '9a8b7c6d-5e4f-4031-8213-b4c5d6e7f8a9';

describe('avatar images (INS-01, M1-03)', () => {
  it('takes the middle square of a landscape picture', () => {
    expect(centreCrop(1600, 900)).toEqual({ x: 350, y: 0, side: 900, size: 512 });
  });

  it('takes the middle square of a portrait picture', () => {
    expect(centreCrop(900, 1600)).toEqual({ x: 0, y: 350, side: 900, size: 512 });
  });

  it('leaves a square picture alone', () => {
    expect(centreCrop(1024, 1024)).toEqual({ x: 0, y: 0, side: 1024, size: 512 });
  });

  it('never makes a small picture bigger', () => {
    expect(centreCrop(200, 300)).toEqual({ x: 0, y: 50, side: 200, size: 200 });
  });

  it('rounds an odd difference rather than working in half pixels', () => {
    expect(centreCrop(101, 100)).toEqual({ x: 1, y: 0, side: 100, size: 100 });
  });

  it('scales a large badge photo down to fit, keeping its proportions', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });

  it('leaves a badge photo that already fits alone', () => {
    expect(fitWithin(1200, 900)).toEqual({ width: 1200, height: 900 });
    expect(fitWithin(1600, 1600)).toEqual({ width: 1600, height: 1600 });
  });

  it('keeps a very long thin picture at least one pixel wide', () => {
    expect(fitWithin(8000, 3)).toEqual({ width: 1600, height: 1 });
  });

  it('keeps a badge readable: bigger than an avatar, and still re-encoded', () => {
    expect(badgeImage.maxSide).toBeGreaterThan(avatarImage.size);
    expect(badgeImage.outputType).toBe('image/webp');
  });

  it('accepts the picture types a phone produces, and nothing else', () => {
    for (const type of avatarImage.acceptedTypes) expect(isAcceptedImageType(type)).toBe(true);
    expect(isAcceptedImageType('image/heic')).toBe(false);
    expect(isAcceptedImageType('application/pdf')).toBe(false);
    expect(isAcceptedImageType('image/svg+xml')).toBe(false);
  });

  it('puts every object under the profile that owns it', () => {
    const path = profileObjectPath(profile, token);
    expect(path).toBe(`${profile}/${token}.webp`);
    expect(isProfileObjectPath(path, profile)).toBe(true);
  });

  it('refuses a path that points outside the profile folder', () => {
    const other = '11111111-2222-4333-8444-555555555555';
    expect(isProfileObjectPath(profileObjectPath(other, token), profile)).toBe(false);
    expect(isProfileObjectPath(`${profile}/../${other}/${token}.webp`, profile)).toBe(false);
    expect(isProfileObjectPath(`${profile}/${token}.svg`, profile)).toBe(false);
    expect(isProfileObjectPath(`${profile}/${token}.webp/x.webp`, profile)).toBe(false);
  });
});
