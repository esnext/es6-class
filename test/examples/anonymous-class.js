/* jshint esnext:true */

var Animal = class {
  sayHi() {
    return 'Hi, I am a '+this.type()+'.';
  }
};

var Dog = class extends Animal {
  type() { return 'dog'; }

  sayHi() {
    return super() + ' WOOF!';
  }
};

assert.equal(new Dog().sayHi(), 'Hi, I am a dog. WOOF!');

var count = 0;
var Cat = class extends (function(){ count++; return Animal; })() {};

assert.equal(count, 1);
