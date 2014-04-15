/* jshint esnext:true */

class Joiner {
  constructor(string) {
    this.string = string;
  }

  join(...items) {
    return items.join(this.string);
  }

  static join(string, ...items) {
    var joiner = new this(string);
    // TODO: use spread params here
    return joiner.join.apply(joiner, items);
  }
}

var joiner = new Joiner(' & ');
assert.equal(joiner.join(4, 5, 6), '4 & 5 & 6');
