var Point = (function() {
  function Point(x, y) {
    this.x = x;
    this.y = y;
  }

  return Point;
})();

var ZeroPoint = (function() {
  function ZeroPoint() {
    Object.getPrototypeOf(ZeroPoint.prototype).constructor.call(this, 0, 0);
  }

  ZeroPoint.__proto__ = Point;
  ZeroPoint.prototype = Object.create(Point.prototype);
  Object.defineProperty(ZeroPoint.prototype, 'constructor', { value: ZeroPoint });

  return ZeroPoint;
})();
