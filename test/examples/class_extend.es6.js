class Animal {
  sayHi() {
    return 'Hi, I am a '+this.type()+'.';
  }
}

class Dog extends Animal {
  type() { return 'dog'; }

  sayHi() {
    return super() + ' WOOF!';
  }
}

console.log(new Dog().sayHi());
