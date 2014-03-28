var Person = (function() {
  function Person() {}
  Person.prototype.getName = function() {
    return this.firstName + ' ' + this.lastName;
  };
  return Person;
})();
