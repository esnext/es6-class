var assert = require('assert');
var parse = require('esprima').parse;
var through = require('through');
var esprimaHarmony = require("esprima");
var recast = require('recast');
var types = recast.types;
var n = types.namedTypes;
var b = types.builders;

assert.ok(
  /harmony/.test(esprimaHarmony.version),
  'looking for esprima harmony but found: ' + esprimaHarmony.version
);

function astOf(stringable) {
  return esprimaHarmony.parse('('+stringable+')').body[0].expression;
}

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
  } else if (n.CallExpression.check(node)) {
    if (n.Identifier.check(node.callee) && node.callee.name === 'super') {
      // super()
      visitSuperCall.call(this, node);
    } else if (n.MemberExpression.check(node.callee) && n.Identifier.check(node.callee.object) && node.callee.object.name === 'super') {
      // super.foo()
      visitSuperCallMemberExpression.call(this, node);
    }
  } else if (n.MemberExpression.check(node) && n.Identifier.check(node.object) && node.object.name === 'super') {
    visitSuperMemberExpression.call(this, node);
  }
}

var DEFAULT_PROPERTY_DESCRIPTOR = { enumerable: b.literal(false) };

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
  var propertyDescriptorMap = Object.create(null);
  var constructor;

  function addPropertyDescriptor(property, key, value, isStatic) {
    if (!propertyDescriptorMap[property]) {
      propertyDescriptors.push({
        name: property,
        descriptor: propertyDescriptorMap[property] = Object.create(DEFAULT_PROPERTY_DESCRIPTOR),
        isStatic: isStatic
      });
    }
    propertyDescriptorMap[property][key] = value;
  }

  /**
   * Process each "method" definition. Methods, getters, setters, and the
   * constructor are all treated as method definitions.
   */
  body.forEach(function(statement) {
    if (n.MethodDefinition.check(statement)) {
      var fn = statement.value;
      var methodName = statement.key.name;
      var isStatic = statement.static;

      if (methodName === 'constructor') {
        constructor = fn;
      } else if (statement.kind) {
        addPropertyDescriptor(
          methodName,
          statement.kind,
          b.functionExpression(null, statement.value.params, statement.value.body)
        );
      } else {
        addPropertyDescriptor(
          methodName,
          'value',
          b.functionExpression(null, fn.params, fn.body),
          isStatic
        );
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
        var value = propertyDescriptor.descriptor[key];
        descriptorObjectProperties.push(b.property('init', b.identifier(key), value));
      }

      var object;
      if (propertyDescriptor.isStatic) {
        object = node.id;
      } else {
        object = b.memberExpression(node.id, b.identifier('prototype'), false);
      }

      definitionStatements.push(b.expressionStatement(b.callExpression(
        b.memberExpression(
          b.identifier('Object'),
          b.identifier('defineProperty'),
          false
        ),
        [
          object,
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
 * Finds a parent node of the correct type and returns it. Returns null if no
 * such node is found.
 *
 * @param {ast-types.Node} node
 * @param {ast-types.Path} path
 * @param {ast-types.Type} type
 * @return {?ast-types.Node}
 */
function getEnclosingNodeOfType(node, path, type) {
  var ancestor = path;
  var methodDefinition;

  while (ancestor) {
    if (type.check(ancestor.node)) {
      return ancestor.node;
    }
    ancestor = ancestor.parent;
  }

  return null;
}

/**
 * Visits a `CallExpression` node which calls `super()` and replaces it with a
 * call to the current method on the superclass for the containing class.
 *
 * @param {Object} node
 * @this {ast-types.Path}
 */
function visitSuperCall(node) {
  var classDeclaration = getEnclosingNodeOfType(node, this, n.ClassDeclaration);
  var methodDefinition = getEnclosingNodeOfType(node, this, n.MethodDefinition);

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

var $superGet = function(self, proto, property) {
  while (proto) {
    var descriptor = Object.getOwnPropertyDescriptor(proto, property);
    if (descriptor) {
      if (descriptor.get) {
        return descriptor.get.call(self);
      } else {
        return descriptor.value;
      }
    }
    proto = Object.getPrototypeOf(proto);
  }
};
$superGet.AST = astOf($superGet);

function visitSuperMemberExpression(node) {
  var classDeclaration = getEnclosingNodeOfType(node, this, n.ClassDeclaration);

  if (classDeclaration) {
    // Replace `super.foo` with an expression that returns the value of the
    // `foo` property as evaluated by the superclass with the current `this`
    // context.
    this.replace(b.callExpression(
      $superGet.AST,
      [
        b.thisExpression(),
        b.callExpression(
          b.memberExpression(b.identifier('Object'), b.identifier('getPrototypeOf'), false),
          [b.memberExpression(classDeclaration.id, b.identifier('prototype'), false)]
        ),
        b.literal(node.property.name)
      ]
    ));
  }
}

function visitSuperCallMemberExpression(node) {
  var classDeclaration = getEnclosingNodeOfType(node, this, n.ClassDeclaration);

  if (classDeclaration) {
    // Replace `super.foo()` with an expression that calls the value of the
    // `foo` property as evaluated by the superclass with the current `this`
    // context.
    this.replace(b.callExpression(
      b.memberExpression(
        b.callExpression(
          $superGet.AST,
          [
            b.thisExpression(),
            b.callExpression(
              b.memberExpression(b.identifier('Object'), b.identifier('getPrototypeOf'), false),
              [b.memberExpression(classDeclaration.id, b.identifier('prototype'), false)]
            ),
            b.literal(node.callee.property.name)
          ]
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
function compile(source, mapOptions) {
  mapOptions = mapOptions || {};

  var recastOptions = {
    // Use the harmony branch of Esprima that installs with es6-class
    // instead of the master branch that recast provides.
    esprima: esprimaHarmony,

    sourceFileName: mapOptions.sourceFileName,
    sourceMapName: mapOptions.sourceMapName
  };

  var ast = recast.parse(source, recastOptions);
  return recast.print(transform(ast), recastOptions);
}

module.exports = function () {
  var data = '';
  return through(write, end);

  function write (buf) { data += buf; }
  function end () {
      this.queue(module.exports.compile(data).code);
      this.queue(null);
  }
};

module.exports.compile = compile;
module.exports.transform = transform;
