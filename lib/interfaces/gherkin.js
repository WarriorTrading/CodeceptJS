const Gherkin = require('@cucumber/gherkin');
const Messages = require('@cucumber/messages');
const {
  Context,
  Suite,
  Test,
} = require('mocha');

const { matchStep } = require('./bdd');
const event = require('../event');
const scenario = require('../scenario');
const Step = require('../step');
const DataTableArgument = require('../data/dataTableArgument');
const transform = require('../transform');

const uuidFn = Messages.IdGenerator.uuid();
const builder = new Gherkin.AstBuilder(uuidFn);
const matcher = new Gherkin.GherkinClassicTokenMatcher(); // or Gherkin.GherkinInMarkdownTokenMatcher()

const parser = new Gherkin.Parser(builder, matcher);
parser.stopAtFirstError = false;

module.exports = (text, file) => {
  const ast = parser.parse(text);
  if (!ast.feature) {
    throw new Error(`No 'Features' available in Gherkin '${file}' provided!`);
  }
  // console.log('*** ast.feature.children:', ast.feature.children);
  const suite = new Suite(ast.feature.name, new Context());
  const tags = ast.feature.tags.map(t => t.name);
  suite.title = `${suite.title} ${tags.join(' ')}`.trim();
  suite.tags = tags || [];
  suite.comment = ast.feature.description;
  suite.feature = ast.feature;
  suite.file = file;
  suite.timeout(0);

  suite.beforeEach('codeceptjs.before', () => scenario.setup(suite));
  suite.afterEach('codeceptjs.after', () => scenario.teardown(suite));
  suite.beforeAll('codeceptjs.beforeSuite', () => scenario.suiteSetup(suite));
  suite.afterAll('codeceptjs.afterSuite', () => scenario.suiteTeardown(suite));

  const runPickle = async (pickle) => {
    // const debug = pickle.uri === 'Logs in';
    // debug && console.log('*** pickle:', JSON.stringify(pickle, null, 2));
    for (const step of pickle.steps) {
      const metaStep = new Step.MetaStep(null, step.text);
      metaStep.actor = step.type.trim();
      const setMetaStep = (step) => {
        if (step.metaStep) {
          if (step.metaStep === metaStep) {
            return;
          }
          setMetaStep(step.metaStep);
          return;
        }
        step.metaStep = metaStep;
      };
      const fn = matchStep(step.text);
      if (step.argument) {
        step.argument.dataTable.parse = () => {
          return new DataTableArgument(step.argument.dataTable);
        };
        fn.params.push(step.argument.dataTable);
        metaStep.comment = `\n${transformTable(step.argument.dataTable)}`;
      }
      step.startTime = Date.now();
      step.match = fn.line;
      event.emit(event.bddStep.before, step);
      event.dispatcher.prependListener(event.step.before, setMetaStep);
      try {
        await fn(...fn.params);
        step.status = 'passed';
      } catch (err) {
        step.status = 'failed';
        step.err = err;
        throw err;
      } finally {
        step.endTime = Date.now();
        event.dispatcher.removeListener(event.step.before, setMetaStep);
      }
      event.emit(event.bddStep.after, step);
    }
  };

  const pickles = Gherkin.compile(ast, ast.feature.name, Messages.IdGenerator.uuid());
  for (const pickle of pickles) {
    const tags = pickle.tags.map(t => t.name);
    const title = `${pickle.name} ${tags.join(' ')}`.trim();
    const test = new Test(title, async () => runPickle(pickle));
    test.tags = tags;
    test.file = file;
    suite.addTest(scenario.test(test));
  }
  return suite;
};

function transformTable(table) {
  let str = '';
  for (const id in table.rows) {
    const cells = table.rows[id].cells;
    str += cells.map(c => c.value).map(c => c.slice(0, 15).padEnd(15)).join(' | ');
    str += '\n';
  }
  return str;
}
