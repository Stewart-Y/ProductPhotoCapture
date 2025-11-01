/**
 * API Client for 3JMS → AI Backgrounds → Shopify Pipeline
 * Handles all communication with the backend server
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

/**
 * Generic fetch wrapper with error handling
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  const response = await fetch(url, config);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Type definitions
 */
export type JobStatus =
  | 'NEW'
  | 'QUEUED'
  | 'BG_REMOVED'
  | 'BACKGROUND_READY'
  | 'COMPOSITED'
  | 'DERIVATIVES'
  | 'SHOPIFY_PUSH'
  | 'SEGMENTING'
  | 'BG_GENERATING'
  | 'COMPOSITING'
  | 'DONE'
  | 'FAILED';

export interface Job {
  id: string;
  sku: string;
  theme: string;
  status: JobStatus;
  img_sha256: string;
  source_url: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cost_usd: number;
  attempt: number;
  error_code: string | null;
  error_message: string | null;
  s3_original_key: string | null;
  s3_cutout_key: string | null;
  s3_mask_key: string | null;
  s3_bg_keys: string | null;
  s3_composite_keys: string | null;
  s3_derivative_keys: string | null;
  manifest_s3_key: string | null;
  shopify_media_ids: string | null;
  download_ms: number | null;
  segmentation_ms: number | null;
  backgrounds_ms: number | null;
  compositing_ms: number | null;
  derivatives_ms: number | null;
  manifest_ms: number | null;
}

export interface JobFilters {
  status?: JobStatus | JobStatus[];
  sku?: string;
  theme?: string;
  startDate?: string;
  endDate?: string;
  minCost?: number;
  maxCost?: number;
  limit?: number;
  offset?: number;
}

export interface DashboardStats {
  today: {
    total: number;
    done: number;
    failed: number;
  };
  cost: {
    avgPerJob24h: number;
    totalMTD: number;
  };
  timing: {
    avgProcessingTime: number;
  };
}

export interface ProcessorStatus {
  isRunning: boolean;
  version: string;
  config?: {
    pollInterval: number;
    concurrency: number;
    maxRetries: number;
  };
  currentJobs?: string[];
}

export interface HealthStatus {
  status: 'ok' | 'error';
  version: string;
  uptime: number;
  timestamp: string;
  services?: {
    database: 'ok' | 'error';
    s3: 'ok' | 'error';
    processor: 'running' | 'stopped';
  };
}

/**
 * Jobs API
 */
export const jobsApi = {
  /**
   * List all jobs with optional filters
   */
  list: async (filters?: JobFilters) => {
    const params = new URLSearchParams();
    if (filters?.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      statuses.forEach(s => params.append('status', s));
    }
    if (filters?.sku) params.append('sku', filters.sku);
    if (filters?.theme) params.append('theme', filters.theme);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.minCost !== undefined) params.append('minCost', filters.minCost.toString());
    if (filters?.maxCost !== undefined) params.append('maxCost', filters.maxCost.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());

    const queryString = params.toString();
    const endpoint = queryString ? `/api/jobs?${queryString}` : '/api/jobs';

    return request<{ jobs: Job[]; total: number }>(endpoint);
  },

  /**
   * Get a single job by ID
   */
  get: async (id: string) => {
    return request<{ job: Job }>(`/api/jobs/${id}`);
  },

  /**
   * Retry a failed job
   */
  retry: async (id: string) => {
    return request<{ success: boolean; job: Job }>(`/api/jobs/${id}/retry`, {
      method: 'POST',
    });
  },

  /**
   * Fail a job manually
   */
  fail: async (id: string, reason: string) => {
    return request<{ success: boolean }>(`/api/jobs/${id}/fail`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  /**
   * Get presigned URL for S3 asset
   */
  getPresignedUrl: async (jobId: string, type: 'original' | 'cutout' | 'mask' | 'composite' | 'derivative') => {
    return request<{ url: string }>(`/api/jobs/${jobId}/presign?type=${type}`);
  },
};

/**
 * Stats API
 */
export const statsApi = {
  /**
   * Get dashboard statistics
   */
  dashboard: async () => {
    return request<DashboardStats>('/api/jobs/stats');
  },
};

/**
 * Processor API
 */
export const processorApi = {
  /**
   * Get processor status
   */
  status: async () => {
    return request<ProcessorStatus>('/api/processor/status');
  },

  /**
   * Start the background processor
   */
  start: async () => {
    return request<{ success: boolean; status: ProcessorStatus }>('/api/processor/start', {
      method: 'POST',
    });
  },

  /**
   * Stop the background processor
   */
  stop: async () => {
    return request<{ success: boolean; status: ProcessorStatus }>('/api/processor/stop', {
      method: 'POST',
    });
  },
};

/**
 * Health API
 */
export const healthApi = {
  /**
   * Get system health status
   */
  check: async () => {
    return request<HealthStatus>('/health');
  },
};

/**
 * Combined API client export
 */
export const apiClient = {
  jobs: jobsApi,
  stats: statsApi,
  processor: processorApi,
  health: healthApi,
};

export default apiClient;
