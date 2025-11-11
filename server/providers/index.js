/**
 * AI Provider Factory
 *
 * Creates and configures AI providers based on environment variables
 * Supports multiple providers: Freepik, Replicate, etc.
 */

import { FreepikSegmentProvider } from './freepik/segment.js';
import { FreepikBackgroundProvider } from './freepik/background.js';
import { FreepikSeedreamProvider } from './freepik/seedream.js';

// Provider registry
const PROVIDERS = {
  freepik: {
    segment: FreepikSegmentProvider,
    background: FreepikBackgroundProvider,
    seedream: FreepikSeedreamProvider
  }
  // Add more providers here:
  // replicate: {
  //   segment: ReplicateSegmentProvider,
  //   background: ReplicateBackgroundProvider
  // }
};

// Singleton instances
let segmentProvider = null;
let backgroundProvider = null;
let seedreamProvider = null;

/**
 * Get segmentation provider instance
 * Creates singleton on first call
 */
export function getSegmentProvider() {
  if (segmentProvider) {
    return segmentProvider;
  }

  const providerName = process.env.AI_PROVIDER || 'freepik';
  const providerClass = PROVIDERS[providerName]?.segment;

  if (!providerClass) {
    throw new Error(`Unsupported AI provider for segmentation: ${providerName}`);
  }

  // Get API key based on provider
  const apiKey = getProviderApiKey(providerName);

  segmentProvider = new providerClass({
    apiKey,
    name: `${providerName}-segment`
  });

  console.log(`[ProviderFactory] Initialized segmentation provider: ${providerName}`);

  return segmentProvider;
}

/**
 * Get background generation provider instance
 * Creates singleton on first call
 */
export function getBackgroundProvider() {
  if (backgroundProvider) {
    return backgroundProvider;
  }

  const providerName = process.env.AI_PROVIDER || 'freepik';
  const providerClass = PROVIDERS[providerName]?.background;

  if (!providerClass) {
    throw new Error(`Unsupported AI provider for background generation: ${providerName}`);
  }

  // Get API key based on provider
  const apiKey = getProviderApiKey(providerName);

  backgroundProvider = new providerClass({
    apiKey,
    name: `${providerName}-background`
  });

  console.log(`[ProviderFactory] Initialized background provider: ${providerName}`);

  return backgroundProvider;
}

/**
 * Get API key for specific provider from environment
 */
function getProviderApiKey(providerName) {
  const keyMap = {
    freepik: process.env.FREEPIK_API_KEY,
    replicate: process.env.REPLICATE_API_KEY
    // Add more providers here
  };

  const apiKey = keyMap[providerName];

  if (!apiKey) {
    throw new Error(`API key not found for provider: ${providerName}. Check your .env file.`);
  }

  return apiKey;
}

/**
 * Get Seedream edit provider instance
 * Creates singleton on first call
 */
export function getSeedreamProvider() {
  if (seedreamProvider) {
    return seedreamProvider;
  }

  const providerName = process.env.AI_PROVIDER || 'freepik';
  const providerClass = PROVIDERS[providerName]?.seedream;

  if (!providerClass) {
    throw new Error(`Unsupported AI provider for Seedream editing: ${providerName}`);
  }

  // Get API key based on provider
  const apiKey = getProviderApiKey(providerName);

  seedreamProvider = new providerClass({
    apiKey,
    name: `${providerName}-seedream`
  });

  console.log(`[ProviderFactory] Initialized Seedream provider: ${providerName}`);

  return seedreamProvider;
}


/**
 * Reset providers (useful for testing)
 */
export function resetProviders() {
  segmentProvider = null;
  backgroundProvider = null;
  seedreamProvider = null;
}

/**
 * Get list of supported providers
 */
export function getSupportedProviders() {
  return Object.keys(PROVIDERS);
}

/**
 * Check if provider is supported
 */
export function isProviderSupported(providerName) {
  return providerName in PROVIDERS;
}

export default {
  getSegmentProvider,
  getBackgroundProvider,
  getSeedreamProvider,
  resetProviders,
  getSupportedProviders,
  isProviderSupported
};
