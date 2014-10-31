/* jshint esnext:true */
/* test computed:true */

var foo = 'bar';

class Computed {
  [foo]() {
    return 1;
  }
}

assert.strictEqual(new Computed().bar(), 1);