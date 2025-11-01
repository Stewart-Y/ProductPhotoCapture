import { QueryClient } from '@tanstack/react-query';

/**
 * Configure React Query client with sensible defaults
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 1000, // 5 seconds
      refetchInterval: 10 * 1000, // 10 seconds for auto-refresh
      retry: 1,
      retryDelay: 1000,
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
    },
  },
});
