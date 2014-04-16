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

/**
 * @private
 */
function astOf(stringable) {
  return esprimaHarmony.parse('('+stringable+')').body[0].expression;
}

/**
 * Builds a function expression from an existing function, copying over the
 * properties that are not part of ast-types's build fields.
 *
 * @private
 * @param {ast-types.Node} fn
 * @return {ast-types.Node}
 */
function copyFunctionExpression(fn) {
  var result = b.functionExpression(
    fn.id,
    fn.params,
    fn.body,
    fn.generator,
    fn.expression
  );
  if ('async' in fn) {
    result.async = fn.async;
  }
  if ('defaults' in fn) {
    result.defaults = fn.defaults;
  }
  if ('rest' in fn) {
    result.rest = fn.rest;
  }
  return result;
}

/**
 * Visits a node of an AST looking class declarations or expressions. This is
 * intended to be used with the ast-types `traverse()` function.
 *
 * @private
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
 * @private
 * @param {Object} node
 * @this {ast-types.Path}
 */
function visitClassDeclaration(node) {
  var body = node.body.body;
  var methodDefinitions = [];
  var propertyDescriptors = [];
  var propertyDescriptorMap = Object.create(null);
  var staticPropertyDescriptors = [];
  var staticPropertyDescriptorMap = Object.create(null);
  var constructor;

  function addPropertyDescriptor(property, key, value, isStatic) {
    var map = isStatic ? staticPropertyDescriptorMap : propertyDescriptorMap;
    var list = isStatic ? staticPropertyDescriptors : propertyDescriptors;

    if (!map[property]) {
      list.push({
        name: property,
        descriptor: map[property] = Object.create(DEFAULT_PROPERTY_DESCRIPTOR)
      });
    }

    map[property][key] = value;
  }

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
        addPropertyDescriptor(
          methodName,
          statement.kind,
          copyFunctionExpression(statement.value)
        );
      } else {
        addPropertyDescriptor(
          methodName,
          'value',
          copyFunctionExpression(fn),
          statement.static
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
  var classDeclaration = b.functionDeclaration(
    node.id,
    constructor.params,
    constructor.body
  );
  if ('rest' in constructor) {
    classDeclaration.rest = constructor.rest;
  }
  if ('defaults' in constructor) {
    classDeclaration.defaults = constructor.defaults;
  }
  var definitionStatements = [classDeclaration];

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

  /**
   * Add methods, getters, and setters for the prototype and the class.
   *
   *   Object.defineProperty(MyClass.prototype, 'name', {
   *     get: function(){}
   *   });
   */
  addDefinePropertyDescriptorCalls(
    b.memberExpression(node.id, b.identifier('prototype'), false),
    propertyDescriptors
  );

  addDefinePropertyDescriptorCalls(
    node.id,
    staticPropertyDescriptors
  );

  /**
   * Add calls to `Object.defineProperty` with the given descriptor information
   * on the given object. This is used to add properties to the "class" itself
   * (static properties) and its prototype (instance properties).
   *
   * @private
   */
  function addDefinePropertyDescriptorCalls(object, descriptors) {
    descriptors.forEach(function(propertyDescriptor) {
      var descriptorObjectProperties = [];
      for (var key in propertyDescriptor.descriptor) {
        var value = propertyDescriptor.descriptor[key];
        descriptorObjectProperties.push(b.property('init', b.identifier(key), value));
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
 * @private
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
 * @private
 * @param {Object} node
 * @this {ast-types.Path}
 */
function visitSuperCall(node) {
  var classDeclaration = getEnclosingNodeOfType(node, this, n.ClassDeclaration);
  var methodDefinition = getEnclosingNodeOfType(node, this, n.MethodDefinition);

  if (classDeclaration && methodDefinition) {
    // Replace `super()` with `Object.getPrototypeOf(MyClass[.prototype]).myMethod.call(this)`.
    var context = methodDefinition.static ?
      classDeclaration.id :
      b.memberExpression(classDeclaration.id, b.identifier('prototype'), false);

    this.replace(b.callExpression(
      b.memberExpression(
        b.memberExpression(
          b.callExpression(
            b.memberExpression(
              b.identifier('Object'),
              b.identifier('getPrototypeOf'),
              false
            ),
            [context]
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

/**
 * @private
 */
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

/**
 * @private
 */
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
 * classes with an equivalent approach in ES5.
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
 * Transform JavaScript written using ES6 by replacing all classes
 * with the equivalent ES5.
 *
 *   compile('class Foo {}'); // 'var Foo = (function() { function Foo() {}; return Foo; })();'
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
