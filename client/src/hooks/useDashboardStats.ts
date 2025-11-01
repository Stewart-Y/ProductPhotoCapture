import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

/**
 * Hook to fetch dashboard statistics
 */
export function useDashboardStats() {
  return useQuery({
    queryKey: ['stats', 'dashboard'],
    queryFn: () => apiClient.stats.dashboard(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}
