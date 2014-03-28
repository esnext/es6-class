var Tripler = (function() {
  function Tripler() {}
  Tripler.prototype.triple = function(n) {
    return n * 3;
  };
  return Tripler;
})();

assert.equal(new Tripler().triple(2), 6);
