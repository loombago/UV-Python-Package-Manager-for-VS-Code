import { installVscodeMock } from './mocks/vscodeMock';

// Must run before importing any module that imports 'vscode'.
installVscodeMock();

const suiteArgIndex = process.argv.indexOf('--suite');
const selectedSuite = suiteArgIndex !== -1 ? process.argv[suiteArgIndex + 1] : 'all';

function runSelectedSuites(): void {
  if (selectedSuite === 'unit' || selectedSuite === 'all') {
    require('./unit/container.test');
    require('./unit/pythonEnvironmentService.test');
    require('./unit/packageManagerService.test');
  }

  if (selectedSuite === 'integration' || selectedSuite === 'all') {
    require('./integration/extensionWorkflow.test');
  }
}

runSelectedSuites();
