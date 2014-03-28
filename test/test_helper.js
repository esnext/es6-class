/**
 * We use `esprima` and `recast` to parse and generate JavaScript for tests.
 */
var recast = require('recast');
var esprimaHarmony = require('esprima');
var recastOptions = {
  tabWidth: 2,
  esprima: esprimaHarmony
};

/**
 * Pull in our library function that operates on JavaScript source.
 */
var compile = require('../lib').compile;

/**
 * To provide good error messages for our tests we show diffs between the
 * expected and actual generated JavaScript. We also add some color to make the
 * differences easier to spot.
 */
var Diff = require('googlediff');
var color = require('cli-color');
var deletion = color.red;
var insertion = color.green;
var unchanged = function(s){ return s; };

/**
 * Reformat the given JavaScript source by pretty-printing it. Any two
 * JavaScript strings with the same AST will have the same result from the
 * function. Therefore, optional semi-colons, non-significant whitespace, and
 * anything else that does not affect the AST will not affect the result of
 * this function.
 *
 * @param {string} source
 * @return {string}
 */
function normalize(source) {
  return recast.prettyPrint(recast.parse(source, recastOptions), recastOptions);
}

/**
 * Indent each line of the given string by the given indent amount.
 *
 * @param {string} string
 * @param {number} amount
 * @return {string}
 */
function indent(string, amount) {
  var lines = string.split('\n');
  var indentation = new Array((amount + 1) * recastOptions.tabWidth).join(' ');
  return lines.map(function(line) { return indentation + line; }).join('\n');
}

/**
 * Turns the given diff data into a colorized-for-a-TTY string.
 *
 * @param {Array.<[number, string]>} diffs
 * @return {string}
 * @private
 */
function colorizeDiffs(diffs) {
  var result = '';
  diffs.forEach(function(diff) {
    var op = diff[0];
    var data = diff[1];
    switch (op) {
      case -1: // delete
        result += deletion(data);
        break;

      case 1: // insert
        result += insertion(data);
        break;

      case 0: // equal
        result += unchanged(data);
        break;
    }
  });
  return result;
}

/**
 * Generates diff data for the given strings. The diff data is cleaned up so as
 * to be suitable for display to a human.
 *
 * @param {string} left
 * @param {string} right
 * @return {Array.<[number, string]>}
 */
function diff(left, right) {
  var differ = new Diff();
  var diffs = differ.diff_main(left, right);
  differ.diff_cleanupSemantic(diffs);
  return colorizeDiffs(diffs);
}

exports.indent = indent;
exports.normalize = normalize;
exports.compile = compile;
exports.diff = diff;
