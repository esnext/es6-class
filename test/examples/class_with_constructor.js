class Multiplier {
  constructor(n=0) {
    this.n = n;
  }
}

assert.strictEqual(new Multiplier().n, 0);
assert.equal(new Multiplier(6).n, 6);
