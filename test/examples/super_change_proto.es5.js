var log = '';

var Base = (function() {
  function Base() {}

  Base.prototype.p = function() {
    log += '[Base]';
  };

  return Base;
})();

var OtherBase = (function() {
  function OtherBase() {}
  OtherBase.prototype.p = function() {
    log += '[OtherBase]';
  };

  return OtherBase;
})();

var Derived = (function() {
  function Derived() {
    Object.getPrototypeOf(Derived.prototype).constructor.apply(this, arguments);
  }

  Derived.__proto__ = Base;
  Derived.prototype = Object.create(Base.prototype);
  Object.defineProperty(Derived.prototype, "constructor", { value: Derived });

  Derived.prototype.p = function() {
    log += '[Derived]';
    Object.getPrototypeOf(Derived.prototype).p.call(this);
    Derived.prototype.__proto__ = OtherBase.prototype;
    Object.getPrototypeOf(Derived.prototype).p.call(this);
  };

  return Derived;
})();

new Derived().p();
assert.equal(log, '[Derived][Base][OtherBase]');
