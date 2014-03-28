var assert = require('assert');
var parse = require('esprima').parse;
var through = require('through');
var guessTabWidth = require('./util').guessTabWidth;
var esprimaHarmony = require("esprima");
var recast = require('recast');
var types = require('ast-types');
var n = types.namedTypes;
var b = types.builders;

assert.ok(
  /harmony/.test(esprimaHarmony.version),
  'looking for esprima harmony but found: ' + esprimaHarmony.version
);

/**
 * Visits a node of an AST looking class declarations or expressions. This is
 * intended to be used with the ast-types `traverse()` function.
 *
 * @param {Object} node
 * @this {ast-types.Path}
 */
function visitNode(node) {
  if (n.ClassDeclaration.check(node)) {
    visitClassDeclaration.call(this, node);
  } else if (n.CallExpression.check(node) && n.Identifier.check(node.callee) && node.callee.name === 'super') {
    visitSuper.call(this, node);
  }
}

/**
 * Visits a `ClassDeclaration` node and replaces it with an equivalent node
 * with the class definition or expression turned into a function with
 * prototype properties for method definitions.
 *
 * @param {Object} node
 * @this {ast-types.Path}
 */
function visitClassDeclaration(node) {
  var body = node.body.body;
  var methodDefinitions = [];
  var propertyDescriptors = [];
  var propertyDescriptorMap = {};
  var constructor;

  /**
   * Process each "method" definition. Methods, getters, setters, and the
   * constructor are all treated as method definitions.
   */
  body.forEach(function(statement) {
    if (n.MethodDefinition.check(statement)) {
      var fn = statement.value;
      var methodName = statement.key.name;

      if (methodName === 'constructor') {
        constructor = fn;
      } else if (statement.kind) {
        if (!propertyDescriptorMap[methodName]) {
          propertyDescriptors.push({
            name: methodName,
            descriptor: propertyDescriptorMap[methodName] = {}
          });
        }
        propertyDescriptorMap[methodName][statement.kind] = statement;
      } else {
        methodDefinitions.push(b.expressionStatement(b.assignmentExpression(
          '=',
          b.memberExpression(node.id, b.memberExpression(b.identifier('prototype'), statement.key, false), false),
          b.functionExpression(null, fn.params, fn.body, false, true, false)
        )));
      }
    }
  });

  if (!constructor) {
    var constructorBody = [];
    if (node.superClass) {
      /**
       * There's no constructor, so build a default one that calls the super
       * class function with the instance as the context.
       *
       *   Object.getPrototypeOf(MyClass.prototype).constructor.apply(this, arguments)
       */
      constructorBody.push(b.expressionStatement(b.callExpression(
        b.memberExpression(
          b.memberExpression(
            b.callExpression(
              b.memberExpression(
                b.identifier('Object'),
                b.identifier('getPrototypeOf'),
                false
              ),
              [b.memberExpression(node.id, b.identifier('prototype'), false)]
            ),
            b.identifier('constructor'),
            false
          ),
          b.identifier('apply'), false),
        [b.thisExpression(), b.identifier('arguments')]
      )));
    }
    constructor = b.functionExpression(null, [], b.blockStatement(constructorBody));
  }

  /**
   * Define the constructor.
   *
   *   function MyClass() {}
   */
  var definitionStatements = [b.functionDeclaration(node.id, constructor.params, constructor.body)];

  if (node.superClass) {
    /**
     * Set up inheritance.
     *
     *   MyClass.__proto__ = MySuper;
     *   MyClass.prototype = Object.create(MySuper.prototype);
     *   Object.defineProperty(MyClass.prototype, 'constructor', { value: MyClass });
     */
    definitionStatements.push(
      b.expressionStatement(b.assignmentExpression(
        '=',
        b.memberExpression(node.id, b.identifier('__proto__'), false),
        node.superClass
      )),
      b.expressionStatement(b.assignmentExpression(
        '=',
        b.memberExpression(node.id, b.identifier('prototype'), false),
        b.callExpression(
          b.memberExpression(b.identifier('Object'), b.identifier('create'), false),
          [b.memberExpression(node.superClass, b.identifier('prototype'), false)]
        )
      )),
      b.expressionStatement(b.callExpression(
        b.memberExpression(b.identifier('Object'), b.identifier('defineProperty'), false),
        [
          b.memberExpression(node.id, b.identifier('prototype'), false),
          b.literal('constructor'),
          b.objectExpression([b.property('init', b.identifier('value'), node.id)])
        ]
      ))
    );
  }

  /**
   * Add the method definitions.
   *
   *   MyClass.prototype.toString = function(){};
   */
  definitionStatements.push.apply(definitionStatements, methodDefinitions);

  if (propertyDescriptors.length) {
    /**
     * Add getters and setters.
     *
     *   Object.defineProperty(MyClass.prototype, 'name', {
     *     get: function(){}
     *   });
     */
    propertyDescriptors.forEach(function(propertyDescriptor) {
      var descriptorObjectProperties = [];
      for (var key in propertyDescriptor.descriptor) {
        var method = propertyDescriptor.descriptor[key];
        descriptorObjectProperties.push(
          b.property(
            'init',
            b.identifier(key),
            b.functionExpression(null, method.value.params, method.value.body)));
      }
      definitionStatements.push(b.expressionStatement(b.callExpression(
        b.memberExpression(
          b.identifier('Object'),
          b.identifier('defineProperty'),
          false
        ),
        [
          b.memberExpression(node.id, b.identifier('prototype'), false),
          b.literal(propertyDescriptor.name),
          b.objectExpression(descriptorObjectProperties)
        ]
      )));
    });
  }

  /**
   * Finally, return the constructor from the IIFE.
   */
  definitionStatements.push(b.returnStatement(node.id));

  /*
   * All our definition statements go into an IIFE whose result goes into a
   * variable at the same scope as the original class.
   */
  var replacement = b.variableDeclaration('var', [
    b.variableDeclarator(node.id, b.callExpression(
      b.functionExpression(null, [], b.blockStatement(
        definitionStatements
      ), false, true, false), []))
  ]);

  this.replace(transform(replacement));
}

/**
 * Visits a `CallExpression` node which calls `super()` and replaces it with a
 * call to the current method on the superclass for the containing class.
 *
 * @param {Object} node
 * @this {ast-types.Path}
 */
function visitSuper(node) {
  var ancestor = this.parent;
  var classDeclaration;
  var methodDefinition;

  // Look for both our containing class definition and method definition.
  while (ancestor && (!classDeclaration || !methodDefinition)) {
    if (!classDeclaration && n.ClassDeclaration.check(ancestor.node)) {
      classDeclaration = ancestor.node;
    }
    if (!methodDefinition && n.MethodDefinition.check(ancestor.node)) {
      methodDefinition = ancestor.node;
    }
    ancestor = ancestor.parent;
  }

  if (classDeclaration && methodDefinition) {
    // Replace `super()` with `Object.getPrototypeOf(MyClass.prototype).myMethod.call(this)`.
    this.replace(b.callExpression(
      b.memberExpression(
        b.memberExpression(
          b.callExpression(
            b.memberExpression(
              b.identifier('Object'),
              b.identifier('getPrototypeOf'),
              false
            ),
            [b.memberExpression(classDeclaration.id, b.identifier('prototype'), false)]
          ),
          methodDefinition.key,
          false
        ),
        b.identifier('call'),
        false
      ),
      [b.thisExpression()].concat(node.arguments)
    ));
  }
}

/**
 * Transform an Esprima AST generated from ES6 by replacing all
 * ArrowFunctionExpression usages with the non-shorthand FunctionExpression.
 *
 * NOTE: The argument may be modified by this function. To prevent modification
 * of your AST, pass a copy instead of a direct reference:
 *
 *   // instead of transform(ast), pass a copy
 *   transform(JSON.parse(JSON.stringify(ast));
 *
 * @param {Object} ast
 * @return {Object}
 */
function transform(ast) {
  return types.traverse(ast, visitNode);
}

/**
 * Transform JavaScript written using ES6 by replacing all arrow function
 * usages with the non-shorthand "function" keyword.
 *
 *   compile('() => 42'); // 'function() { return 42; };'
 *
 * @param {string} source
 * @return {string}
 */
function compile(source) {
  var recastOptions = {
    tabWidth: guessTabWidth(source),
    // Use the harmony branch of Esprima that installs with regenerator
    // instead of the master branch that recast provides.
    esprima: esprimaHarmony
  };

  var ast = recast.parse(source, recastOptions);
  return recast.print(transform(ast), recastOptions);
}

module.exports = function () {
  var data = '';
  return through(write, end);

  function write (buf) { data += buf; }
  function end () {
      this.queue(module.exports.compile(data));
      this.queue(null);
  }
};

module.exports.compile = compile;
module.exports.transform = transform;
