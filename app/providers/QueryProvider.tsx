import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PropsWithChildren } from "react";

const client = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 60 * 1000,
      gcTime: 15 * 60 * 1000,
    },
    mutations: {
      retry: 0,
    },
  },
});

export default function QueryProvider({ children }: PropsWithChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
