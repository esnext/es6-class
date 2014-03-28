var Animal = function() {
  function Animal() {}

  Animal.prototype.sayHi = function() {
    return 'I am an animal.';
  };

  Animal.prototype.sayOther = function() {
    return 'WAT?!';
  };

  return Animal;
}();

var Horse = function() {
  function Horse() {
     Object.getPrototypeOf(Horse.prototype).constructor.apply(this, arguments);
   }

   Horse.__proto__ = Animal;
   Horse.prototype = Object.create(Animal.prototype);
   Object.defineProperty(Horse.prototype, "constructor", { value: Horse });

  Horse.prototype.sayHi = function() {
    return function(self, proto, property) {
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
    }(this, Object.getPrototypeOf(Horse.prototype), 'sayOther').call(this);
  };

  Horse.prototype.sayOther = function() {
    return 'I see dead objects.';
  };

  return Horse;
}();

assert.equal(new Horse().sayHi(), 'WAT?!');
