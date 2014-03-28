var Person = (function() {
  function Person(firstName, lastName) {
    this.firstName = firstName;
    this.lastName = lastName;
  }

  Object.defineProperty(Person.prototype, 'name', {
    get: function() {
      return this.firstName + ' ' + this.lastName;
    },

    set: function(name) {
      var parts = name.split(' ');
      this.firstName = parts[0];
      this.lastName = parts[1];
    }
  });

  return Person;
})();

var mazer = new Person('Mazer', 'Rackham');
assert.equal(mazer.name, 'Mazer Rackham');
mazer.name = 'Ender Wiggin';
assert.equal(mazer.firstName, 'Ender');
assert.equal(mazer.lastName, 'Wiggin');
