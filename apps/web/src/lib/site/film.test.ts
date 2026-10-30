import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { joinFilm } from './film';

/** The film and its captions as the site serves them, from the public folder. */
const publicFolder = path.resolve(import.meta.dirname, '../../../public');
const film = readFileSync(path.join(publicFolder, joinFilm.src));
const captions = readFileSync(path.join(publicFolder, joinFilm.captions), 'utf8');

interface Box {
  type: string;
  start: number;
  end: number;
}

/** The boxes an MP4 file is made of, one level at a time: ftyp, moov, mdat and so on. */
function boxes(data: Buffer, from = 0, to = data.length): Box[] {
  const found: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = data.readUInt32BE(at);
    let header = 8;
    if (size === 1) {
      size = Number(data.readBigUInt64BE(at + 8));
      header = 16;
    } else if (size === 0) {
      size = to - at;
    }
    found.push({ type: data.toString('latin1', at + 4, at + 8), start: at + header, end: at + size });
    at += size;
  }
  return found;
}

/** Where a four-letter box starts inside the index, its contents after its own header. */
function inIndex(type: string): number {
  const index = boxes(film).find((box) => box.type === 'moov');
  if (index === undefined) throw new Error('the film has no index');
  const at = film.subarray(index.start, index.end).indexOf(Buffer.from(type, 'latin1'));
  if (at < 0) throw new Error(`the film's index has no ${type}`);
  return index.start + at + 4;
}

/** Reads an H.264 parameter set bit by bit, with its emulation prevention bytes taken out. */
class Bits {
  private bytes: number[];
  private at = 0;

  constructor(raw: Buffer) {
    this.bytes = [];
    for (let i = 0; i < raw.length; i += 1) {
      const byte = raw[i] ?? 0;
      if (byte === 3 && raw[i - 1] === 0 && raw[i - 2] === 0) continue;
      this.bytes.push(byte);
    }
  }

  bits(count: number): number {
    let value = 0;
    for (let i = 0; i < count; i += 1) {
      const byte = this.bytes[this.at >> 3] ?? 0;
      value = value * 2 + ((byte >> (7 - (this.at & 7))) & 1);
      this.at += 1;
    }
    return value;
  }

  /** An unsigned Exp-Golomb number, as the parameter set writes most of its fields. */
  ue(): number {
    let zeros = 0;
    while (this.bits(1) === 0) zeros += 1;
    return 2 ** zeros - 1 + this.bits(zeros);
  }
}

/** The video's profile, level, colour sampling and bit depth, from its sequence parameter set. */
function video() {
  const avcC = inIndex('avcC');
  const length = film.readUInt16BE(avcC + 6);
  const sps = new Bits(film.subarray(avcC + 8, avcC + 8 + length));
  sps.bits(8); // the unit's own header
  const profile = sps.bits(8);
  sps.bits(8); // constraint flags
  const level = sps.bits(8) / 10;
  sps.ue(); // which parameter set this is
  // Only the High profiles and up say how colour is sampled; the others are always 4:2:0, 8 bit.
  const highProfiles = [100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135];
  let chroma = 1;
  let lumaBits = 8;
  let chromaBits = 8;
  if (highProfiles.includes(profile)) {
    chroma = sps.ue();
    if (chroma === 3) sps.bits(1);
    lumaBits = 8 + sps.ue();
    chromaBits = 8 + sps.ue();
  }
  return { profile, level, chroma, lumaBits, chromaBits };
}

/** An MPEG-4 descriptor's tag and where its contents run, its size written seven bits a byte. */
function descriptor(at: number): { tag: number; start: number; end: number } {
  const tag = film[at] ?? 0;
  let size = 0;
  let next = at + 1;
  for (let i = 0; i < 4; i += 1) {
    const byte = film[next] ?? 0;
    next += 1;
    size = size * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) break;
  }
  return { tag, start: next, end: next + size };
}

/** The sound's codec, from the elementary stream descriptor under its sample entry. */
function audio() {
  const stream = descriptor(inIndex('esds') + 4);
  const flags = film[stream.start + 2] ?? 0;
  let at = stream.start + 3;
  if (flags & 0x80) at += 2;
  if (flags & 0x40) at += 1 + (film[at] ?? 0);
  if (flags & 0x20) at += 2;
  const decoder = descriptor(at);
  const specific = descriptor(decoder.start + 13);
  return { tag: decoder.tag, objectType: film[decoder.start] ?? 0, audioObjectType: (film[specific.start] ?? 0) >> 3 };
}

/**
 * The join page's film plays wherever somebody presses play (D-412): in every desktop browser,
 * Safari on an iPhone, Chrome and Samsung Internet on Android, Firefox. That comes down to the file:
 * H.264 that every phone decodes in hardware, sound they all play, and the index where a phone
 * can read it before the rest has arrived. A new cut is held to the same, here, before it ships.
 */
describe('the join page film plays in every browser, on a phone or not (D-412)', () => {
  it('is H.264 a phone decodes: Baseline, Main or High, at level 4.2 or below', () => {
    const { profile, level } = video();
    expect([66, 77, 100]).toContain(profile);
    expect(level).toBeLessThanOrEqual(4.2);
  });

  it('samples colour at 4:2:0 in 8 bits, which Safari and phones need, not 4:4:4 or 10 bit', () => {
    expect(video()).toMatchObject({ chroma: 1, lumaBits: 8, chromaBits: 8 });
  });

  it('carries its sound as AAC LC, which every browser plays', () => {
    expect(audio()).toEqual({ tag: 4, objectType: 0x40, audioObjectType: 2 });
  });

  it('has its index before the film itself, so a phone can start before the rest has arrived', () => {
    const order = boxes(film).map((box) => box.type);
    expect(order[0]).toBe('ftyp');
    expect(order.indexOf('moov')).toBeGreaterThan(0);
    expect(order.indexOf('moov')).toBeLessThan(order.indexOf('mdat'));
  });

  it('is light enough to stream on a phone', () => {
    expect(film.length).toBeLessThan(25 * 1024 * 1024);
  });

  it('has captions a browser reads', () => {
    expect(captions.startsWith('WEBVTT')).toBe(true);
  });
});
