export class SeededRandom {
  constructor(seed) {
    this.initialSeed = (seed >>> 0) || 0x6d2b79f5;
    this.state = this.initialSeed;
  }

  reset() {
    this.state = this.initialSeed;
  }

  nextUint32() {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  next() {
    return this.nextUint32() / 0x1_0000_0000;
  }

  nextInt(maxExclusive) {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError('maxExclusive must be a positive integer');
    }

    return Math.floor(this.next() * maxExclusive);
  }
}
