import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { pos } from '../api';
import type { CreatePOSTransactionDto, ValidatePOSTransactionDto } from '../../../packages/shared-types/src/pos';

export function useTransaction() {
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  const validateMutation = useMutation({
    mutationFn: (data: ValidatePOSTransactionDto) => pos.validateTransaction(data),
  });

  const createMutation = useMutation({
    mutationFn: (data: CreatePOSTransactionDto) =>
      pos.createTransaction(data),
  });

  const validate = async (data: ValidatePOSTransactionDto) => {
    try {
      await validateMutation.mutateAsync(data);
      return { valid: true, error: null };
    } catch (error: any) {
      return { valid: false, error: error.message || 'Validation failed' };
    }
  };

  const create = async (data: Omit<CreatePOSTransactionDto, 'idempotencyKey'>) => {
    // Generate idempotency key if not exists
    const key = idempotencyKey || `pos-${Date.now()}-${data.customerId}-${data.motorcycleId}`;
    setIdempotencyKey(key);

    try {
      const result = await createMutation.mutateAsync({ ...data, idempotencyKey: key });
      return { success: true, data: result, error: null };
    } catch (error: any) {
      return { success: false, data: null, error: error.message || 'Transaction failed' };
    }
  };

  const reset = () => {
    setIdempotencyKey('');
    validateMutation.reset();
    createMutation.reset();
  };

  return {
    validate,
    create,
    reset,
    isValidating: validateMutation.isPending,
    isCreating: createMutation.isPending,
    validationError: validateMutation.error,
    creationError: createMutation.error,
  };
}
