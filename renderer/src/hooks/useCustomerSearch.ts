import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { pos } from '../api';

export function useCustomerSearch(initialQuery = '') {
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['pos-customers', debouncedQuery],
    queryFn: () => pos.searchCustomers(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
  });

  return {
    query,
    setQuery,
    results: data?.items || [],
    isLoading,
    error,
  };
}
