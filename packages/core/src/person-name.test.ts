import { describe, expect, it } from 'vitest';
import { nameHalves, wholeName } from './person-name.ts';

describe('a name in two halves (INS-01, D-196)', () => {
  it('splits on the last space, so middle and double-barrelled names stay put', () => {
    expect(nameHalves('Sarah Khan')).toEqual({ firstName: 'Sarah', lastName: 'Khan' });
    expect(nameHalves('Mary Jane Watson')).toEqual({ firstName: 'Mary Jane', lastName: 'Watson' });
    expect(nameHalves('Ada  Lovelace ')).toEqual({ firstName: 'Ada', lastName: 'Lovelace' });
  });

  it('takes a name with no space at all as a first name', () => {
    expect(nameHalves('Prince')).toEqual({ firstName: 'Prince', lastName: '' });
    expect(nameHalves('   ')).toEqual({ firstName: '', lastName: '' });
  });

  it('puts them back together, and leaves out a half that is not there', () => {
    expect(wholeName({ firstName: 'Sarah', lastName: 'Khan' })).toBe('Sarah Khan');
    expect(wholeName({ firstName: ' Prince ', lastName: '' })).toBe('Prince');
    expect(wholeName(nameHalves('Mary Jane Watson'))).toBe('Mary Jane Watson');
  });
});
