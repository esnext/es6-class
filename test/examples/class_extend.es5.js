var Animal = (function() {
  function Animal() {}

  Animal.prototype.sayHi = function() {
    return 'Hi, I am a '+this.type()+'.';
  };

  return Animal;
})();

var Dog = (function() {
  function Dog() {
    Object.getPrototypeOf(Dog.prototype).constructor.apply(this, arguments);
  }

  Dog.__proto__ = Animal;
  Dog.prototype = Object.create(Animal.prototype);
  Object.defineProperty(Dog.prototype, 'constructor', { value: Dog });

  Dog.prototype.type = function() {
    return 'dog';
  };

  Dog.prototype.sayHi = function() {
    return Object.getPrototypeOf(Dog.prototype).sayHi.call(this) + ' WOOF!';
  };

  return Dog;
})();

assert.equal(new Dog().sayHi(), 'Hi, I am a dog. WOOF!');
