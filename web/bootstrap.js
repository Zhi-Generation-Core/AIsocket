import * as workflow from './workflow-ui.js';

workflow.registerWorkspaceInit(async (options) => {
  const { initWorkspace } = await import('./renderer.js');
  initWorkspace(options);
});

workflow.startApp();
