var Obj = (function() {
  function Obj() {
    Object.getPrototypeOf(Obj.prototype).constructor.call(this);
  }

  return Obj;
})();
