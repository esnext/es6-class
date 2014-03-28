var Foo = (function() {
  function Foo() {}
  return Foo;
})();

assert.equal(new Foo().constructor, Foo, 'Foo instances should have Foo as constructor');
assert.ok(new Foo() instanceof Foo, 'Foo instances should be `instanceof` Foo');
