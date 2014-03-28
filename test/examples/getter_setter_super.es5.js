var Animal = function() {
  function Animal() {}

  Object.defineProperty(Animal.prototype, 'sound', {
    get: function() {
      return 'I am a ' + this.type + '.';
    }
  });

  return Animal;
}();

var Cat = function() {
  function Cat() {
    Object.getPrototypeOf(Cat.prototype).constructor.apply(this, arguments);
  }

  Cat.__proto__ = Animal;
  Cat.prototype = Object.create(Animal.prototype);
  Object.defineProperty(Cat.prototype, 'constructor', {
    value: Cat
  });

  Object.defineProperty(Cat.prototype, 'type', {
    get: function() {
      return 'cat';
    }
  });

  Object.defineProperty(Cat.prototype, 'sound', {
    get: function() {
      return (function(self, proto, property) {
        while (proto) {
          var descriptor = Object.getOwnPropertyDescriptor(proto, property);
          if (descriptor) {
            if (descriptor.get) {
              return descriptor.get.call(self);
            } else {
              return descriptor.value;
            }
          }
          proto = Object.getPrototypeOf(proto);
        }
      })(this, Object.getPrototypeOf(Cat.prototype), 'sound') + ' MEOW!';
    }
  });

  return Cat;
}();

assert.equal(new Cat().sound, 'I am a cat. MEOW!');
