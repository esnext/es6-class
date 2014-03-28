var Person = (function() {
  function Person() {}
  Person.prototype.getName = function() {
    return this.firstName + ' ' + this.lastName;
  };
  return Person;
})();

var me = new Person();
me.firstName = 'Brian';
me.lastName = 'Donovan';
assert.equal(me.getName(), 'Brian Donovan');
