import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

/**
 * Hook to fetch system health status
 */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => apiClient.health.check(),
    refetchInterval: 10000, // Refresh every 10 seconds
  });
}
