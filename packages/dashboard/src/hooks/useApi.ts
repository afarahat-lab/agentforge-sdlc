import { createContext, useContext } from 'react';
import type { DashboardApiClient } from '../api/client';

const ApiContext = createContext<DashboardApiClient | null>(null);
export const ApiProvider = ApiContext.Provider;

export function useDashboardApi(): DashboardApiClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error('useDashboardApi must be used within ApiProvider');
  return client;
}
