import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, type JobFilters } from '../lib/api-client';

const JOBS_QUERY_KEY = ['jobs'];

/**
 * Hook to list all jobs with optional filters
 */
export function useJobs(filters?: JobFilters) {
  return useQuery({
    queryKey: [...JOBS_QUERY_KEY, filters],
    queryFn: () => apiClient.jobs.list(filters),
    refetchInterval: 10000, // Auto-refresh every 10 seconds
  });
}

/**
 * Hook to get a single job by ID
 */
export function useJob(id: string | undefined) {
  return useQuery({
    queryKey: [...JOBS_QUERY_KEY, id],
    queryFn: () => apiClient.jobs.get(id!),
    enabled: !!id,
    refetchInterval: 5000, // Auto-refresh every 5 seconds for single job
  });
}

/**
 * Hook to retry a job
 */
export function useRetryJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.jobs.retry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: JOBS_QUERY_KEY });
    },
  });
}

/**
 * Hook to fail a job manually
 */
export function useFailJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.jobs.fail(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: JOBS_QUERY_KEY });
    },
  });
}

/**
 * Hook to get presigned URL for a job asset
 */
export function usePresignedUrl(
  jobId: string | undefined,
  type: 'original' | 'cutout' | 'mask' | 'composite' | 'derivative'
) {
  return useQuery({
    queryKey: [...JOBS_QUERY_KEY, jobId, 'presign', type],
    queryFn: () => apiClient.jobs.getPresignedUrl(jobId!, type),
    enabled: !!jobId,
    staleTime: 30 * 60 * 1000, // 30 minutes (presigned URLs are long-lived)
  });
}
