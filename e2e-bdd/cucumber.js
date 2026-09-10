// Cucumber.js configuration — see https://github.com/cucumber/cucumber-js/blob/main/docs/configuration.md
module.exports = {
  default: {
    requireModule: ['ts-node/register'],
    require: ['step-definitions/**/*.ts'],
    paths: ['features/**/*.feature'],
    format: [
      'progress-bar',
      'summary',
      'json:reports/cucumber-report.json',
    ],
    formatOptions: { snippetInterface: 'async-await' },
  },
};
