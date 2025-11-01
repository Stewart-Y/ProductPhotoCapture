import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

const PROCESSOR_QUERY_KEY = ['processor', 'status'];

/**
 * Hook to fetch processor status
 */
export function useProcessorStatus() {
  return useQuery({
    queryKey: PROCESSOR_QUERY_KEY,
    queryFn: () => apiClient.processor.status(),
    refetchInterval: 5000, // Refresh every 5 seconds
  });
}

/**
 * Hook to start the processor
 */
export function useStartProcessor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.processor.start(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROCESSOR_QUERY_KEY });
    },
  });
}

/**
 * Hook to stop the processor
 */
export function useStopProcessor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.processor.stop(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROCESSOR_QUERY_KEY });
    },
  });
}
