#!/usr/bin/env node
/**
 * Converts a Cucumber JSON report into JUnit XML.
 *
 * @cucumber/cucumber dropped its built-in JUnit formatter years ago, and the
 * common workarounds are unmaintained npm packages — so this is a small,
 * dependency-free converter instead. It exists so CI tools that only speak
 * JUnit (notably Azure Pipelines' `PublishTestResults@2` task) can render
 * BDD results the same way they render everything else.
 *
 * Usage: node cucumber-json-to-junit.js <input.json> <output.xml>
 */
const fs = require('fs');
const path = require('path');

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stepDurationSeconds(step) {
  const nanos = step.result?.duration ?? 0;
  return nanos / 1e9;
}

function scenarioOutcome(elements) {
  const steps = elements.flatMap((el) => el.steps || []);
  const failedStep = steps.find((s) => s.result?.status === 'failed');
  if (failedStep) return { status: 'failed', message: failedStep.result.error_message || 'Step failed' };
  if (steps.some((s) => ['pending', 'undefined'].includes(s.result?.status))) {
    return { status: 'pending', message: 'One or more steps are pending/undefined' };
  }
  if (steps.length > 0 && steps.every((s) => s.result?.status === 'skipped')) {
    return { status: 'skipped', message: null };
  }
  return { status: 'passed', message: null };
}

function convert(features) {
  const suites = features.map((feature) => {
    const scenarios = (feature.elements || []).filter((el) => el.type === 'scenario');

    const testcases = scenarios.map((scenario) => {
      const { status, message } = scenarioOutcome([scenario]);
      const time = (scenario.steps || []).reduce((sum, s) => sum + stepDurationSeconds(s), 0);
      const name = escapeXml(scenario.name || '(unnamed scenario)');

      let body = '';
      if (status === 'failed') {
        body = `<failure message="${escapeXml(message)}"><![CDATA[${message}]]></failure>`;
      } else if (status === 'pending' || status === 'skipped') {
        body = '<skipped/>';
      }

      return `    <testcase classname="${escapeXml(feature.name)}" name="${name}" time="${time.toFixed(3)}">${body}</testcase>`;
    });

    const failures = scenarios.filter((s) => scenarioOutcome([s]).status === 'failed').length;
    const skipped = scenarios.filter((s) => ['pending', 'skipped'].includes(scenarioOutcome([s]).status)).length;
    const totalTime = testcases.length
      ? scenarios.reduce((sum, s) => sum + (s.steps || []).reduce((a, st) => a + stepDurationSeconds(st), 0), 0)
      : 0;

    return (
      `  <testsuite name="${escapeXml(feature.name)}" tests="${scenarios.length}" failures="${failures}" ` +
      `skipped="${skipped}" time="${totalTime.toFixed(3)}">\n${testcases.join('\n')}\n  </testsuite>`
    );
  });

  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n${suites.join('\n')}\n</testsuites>\n`;
}

function main() {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath || !outputPath) {
    console.error('Usage: node cucumber-json-to-junit.js <input.json> <output.xml>');
    process.exit(1);
  }

  const features = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const xml = convert(features);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, xml);
  console.log(`Wrote JUnit XML to ${outputPath}`);
}

main();
