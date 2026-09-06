import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pos } from '../api';

export function useReservation() {
  const queryClient = useQueryClient();

  const useActiveReservations = (branchId?: string, customerId?: string) =>
    useQuery({
      queryKey: ['active-reservations', branchId, customerId],
      queryFn: () => pos.getActiveReservations(branchId, customerId),
    });

  const convertMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      pos.convertReservation(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-reservations'] });
      queryClient.invalidateQueries({ queryKey: ['pos-dashboard'] });
    },
  });

  return {
    useActiveReservations,
    convertMutation,
  };
}
