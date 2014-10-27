/**
 * We pull in example files from test/examples/*.js. Write your assertions in
 * the file alongside the ES6 class "setup" code. The node `assert` library
 * will already be in the context.
 */

Error.stackTraceLimit = 20;

var recast = require('recast');

var es6class = require('../lib');
var es6restParams = require('es6-rest-params');
var es6defaultParams = require('es6-default-params');

var fs = require('fs');
var path = require('path');
var RESULTS = 'test/results';

if (!fs.existsSync(RESULTS)) {
  fs.mkdirSync(RESULTS);
}

require('example-runner').runCLI(process.argv.slice(2), {
  transform: function(source, testName, filename) {
    var recastOptions = {
      sourceFileName: filename,
      sourceMapName: filename + '.map'
    };

    var ast = recast.parse(source, recastOptions);
    ast = es6defaultParams.transform(es6restParams.transform(es6class.transform(ast)));
    var result = recast.print(ast, recastOptions);

    fs.writeFileSync(path.join(RESULTS, testName + '.js'), result.code, 'utf8');
    fs.writeFileSync(path.join(RESULTS, testName + '.js.map'), JSON.stringify(result.map), 'utf8');
    return result.code;
  }
});
