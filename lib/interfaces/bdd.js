const { CucumberExpression, ParameterTypeRegistry } = require('@cucumber/cucumber-expressions');
const Config = require('../config');

let steps = {};

const STACK_POSITION = 2;

/**
 * @param {*} step
 * @param {*} fn
 */
const addStep = (step, fn) => {
  const avoidDuplicateSteps = Config.get('gherkin', {}).avoidDuplicateSteps || false;
  const stack = (new Error()).stack;
  fn.line = stack && stack.split('\n')[STACK_POSITION];
  if (fn.line) {
    fn.line = fn.line
      .trim()
      .replace(/^at (.*?)\(/, '(')
      .replace(codecept_dir, '.');
    const result = fn.line.match(/.*\/([^.]*)\..*/);
    fn.file = result != null ? result[1].toLowerCase() : 'NG';
  }
  if (steps[fn.file] == null) {
    steps[fn.file] = {};
  }

  if (avoidDuplicateSteps && steps[fn.file][step]) {
    throw new Error(`Step '${step}' at ${fn.line} is already defined`);
  }
  steps[fn.file][step] = fn;
};

const parameterTypeRegistry = new ParameterTypeRegistry();

const matchStep = (step, stepFilename) => {
  for (const stepName in steps[stepFilename]) {
    if (stepName.indexOf('/') === 0) {
      const regExpArr = stepName.match(new RegExp('^/(.*?)/([gimy]*)$')) || [];
      const res = step.match(new RegExp(regExpArr[1], regExpArr[2]));
      if (res) {
        const fn = steps[stepFilename][stepName];
        fn.params = res.slice(1);
        return fn;
      }
      continue;
    }
    const expression = new CucumberExpression(stepName, parameterTypeRegistry);
    const res = expression.match(step);
    if (res) {
      const fn = steps[stepFilename][stepName];
      fn.params = res.map(arg => arg.getValue());
      return fn;
    }
  }
  throw new Error(`No steps matching "${step.toString()}"`);
};

const clearSteps = () => {
  steps = {};
};

const getSteps = () => {
  return steps;
};

module.exports = {
  Given: addStep,
  When: addStep,
  Then: addStep,
  And: addStep,
  matchStep,
  getSteps,
  clearSteps,
};
