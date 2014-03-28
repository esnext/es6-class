/**
 * We pull in example files from test/examples/*.js. Each example has two
 * files, one ending in `.es6.js` containing ES6 source and another ending in
 * `.es5.js` containing the ES5 source we expect to get when compiling the ES6
 * file.
 *
 * When adding tests you may write the ES5 files with whatever formatting makes
 * the most sense, since the files are not compared exactly. Instead, we use
 * `recast` to normalize the expected and actual source before comparing.
 */

var fs = require('fs');
var path = require('path');
var glob = require('glob');

var vm = require('vm');
var assert = require('assert');

var helper = require('./test_helper');
var normalize = helper.normalize;
var compile = helper.compile;
var indent = helper.indent;
var diff = helper.diff;

var color = require('cli-color');
var header = color.bold;

var ES6_EXAMPLE_EXT = '.es6.js';
var ES5_EXAMPLE_EXT = '.es5.js';

/**
 * Prints a line to stdout for the given test indicating that it passed.
 *
 * @param {string} testName
 */
function printSuccess(testName) {
  console.log('✓ ' + testName);
}

/**
 * Prints a line to stdout for the given test indicating that it failed. In
 * addition, prints any additional information indented one level.
 *
 * @param {string} testName
 * @param {Array.<string>} chunks
 */
function printFailure(testName, chunks) {
  console.log('✘ ' + testName);
  console.log();
  chunks.forEach(function(chunk) {
    console.log(indent(chunk, 1));
  });
}

/**
 * Runs the test for the given source files, printing the results and calling
 * the callback with the success status of the test.
 *
 * @param {string} basename
 * @param {string} es6file
 * @param {string} es5file
 * @param {function(boolean)} callback
 */
function runTest(basename, es6file, es5file, callback) {
  /**
   * Notifies the callback that we were unsuccessful and prints the error info.
   *
   * @param {Error} err
   * @private
   */
  function error(err) {
    printFailure(basename, [err.stack, '']);
    callback(false);
  }

  fs.readFile(es6file, 'utf8', function(err, es6source) {
    if (err) { return error(err); }

    fs.readFile(es5file, 'utf8', function(err, es5source) {
      if (err) { return error(err); }

      try {
        var actual = normalize(compile(es6source));
        var expected = normalize(es5source);

        if (expected === actual) {
          vm.runInNewContext(es5source, { assert: assert });
          printSuccess(basename);
          callback(true);
        } else {
          printFailure(basename, [
            header('ES6'),
            '',
            es6source,
            '',
            header('Expected ES5'),
            '',
            es5source,
            '',
            header('Actual ES5'),
            '',
            actual,
            '',
            header('Normalized Diff'),
            '',
            diff(expected, actual)
          ]);
          callback(false);
        }
      } catch (ex) {
        error(ex);
      }
    });
  });
}

/**
 * Tests the library using the given ES6 source file. Calls back with a
 * success/failure status flag.
 *
 * @param {string} filename
 * @param {function(boolean)} callback
 */
function processES6File(filename, callback) {
  var es6file = filename;
  var basename = path.basename(filename, ES6_EXAMPLE_EXT);
  var es5file = path.join(path.dirname(es6file), basename + ES5_EXAMPLE_EXT);
  runTest(basename, es6file, es5file, callback);
}

glob(path.join(__dirname, 'examples/*' + ES6_EXAMPLE_EXT), function(err, filenames) {
  if (err) { throw err; }

  var passed = [];
  var failed = [];

  function next() {
    var filename = filenames.shift();
    if (filename) {
      processES6File(filename, function(success) {
        (success ? passed : failed).push(path.basename(filename, ES6_EXAMPLE_EXT));
        next();
      });
    } else {
      done();
    }
  }

  function done() {
    console.log();
    console.log('' + (passed.length + failed.length) + ' total, ' + passed.length + ' passed, ' + failed.length + ' failed.');
    process.exit(failed.length ? 1 : 0);
  }

  next();
});
