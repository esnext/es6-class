/**
 * We pull in example files from test/examples/*.js. Write your assertions in
 * the file alongside the ES6 class "setup" code. The node `assert` library
 * will already be in the context.
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
 * @param {string} filename
 * @param {function(boolean)} callback
 */
function runTest(basename, filename, callback) {
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

  fs.readFile(filename, 'utf8', function(err, source) {
    if (err) { return error(err); }

    try {
      vm.runInNewContext(compile(source).code, { assert: assert });
      printSuccess(basename);
      callback(true);
    } catch (ex) {
      error(ex);
    }
  });
}

/**
 * Tests the library using the given ES6 source file. Calls back with a
 * success/failure status flag.
 *
 * @param {string} filename
 * @param {function(boolean)} callback
 */
function processFile(filename, callback) {
  var basename = path.basename(filename, '.js');
  runTest(basename, filename, callback);
}

/**
 * Runs the given test files and exits with the appropriate status code.
 *
 * @param {Array.<string>} filenames
 */
function run(filenames) {
  var passed = [];
  var failed = [];

  function next() {
    var filename = filenames.shift();
    if (filename) {
      processFile(filename, function(success) {
        (success ? passed : failed).push(path.basename(filename, '.js'));
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
}

var files = process.argv.slice(2);

if (files.length) {
  run(files);
} else {
  glob(path.join(__dirname, 'examples/*.js'), function(err, files) {
    if (err) { throw err; }
    run(files);
  });
}
