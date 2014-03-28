var Multiplier = (function() {
  function Multiplier(n) {
    this.n = n;
  }
  return Multiplier;
})();

assert.equal(new Multiplier(6).n, 6);
