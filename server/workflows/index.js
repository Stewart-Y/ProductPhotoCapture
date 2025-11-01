/**
 * Workflow Module Exports
 *
 * Central export point for all workflow operations
 */

// Flow v1 workflows (legacy)
export { compositeImage, batchComposite } from './composite.js';

// Flow v2 workflows
export { generateDerivatives, batchGenerateDerivatives } from './derivatives.js';
export { buildManifest, getManifest } from './manifest.js';
export { normalizeToSRGB, verifySRGB, batchNormalizeToSRGB, detectColorspaceIssues } from './srgb-normalizer.js';

export default {
  // Legacy
  compositeImage,
  batchComposite,

  // Flow v2
  generateDerivatives,
  batchGenerateDerivatives,
  buildManifest,
  getManifest,
  normalizeToSRGB,
  verifySRGB,
  batchNormalizeToSRGB,
  detectColorspaceIssues
};
