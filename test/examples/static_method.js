class Tripler {
  static triple(n) {
    return n * 3;
  }
}

var tripler = new Tripler();

assert.equal(Tripler.triple(2), 6);
assert.equal(tripler.triple, undefined);
