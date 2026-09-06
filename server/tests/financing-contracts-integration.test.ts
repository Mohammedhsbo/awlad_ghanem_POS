import { describe, it, expect } from 'vitest';
import { FinancingContractsService } from '../src/financing-contracts/financing-contracts.service.js';
import { FinancingContractsController } from '../src/financing-contracts/financing-contracts.controller.js';
import { Resource, Action } from '@motorcycle-system/shared-types';

describe('Financing Contracts Module Integration', () => {
  it('should have correct exports', () => {
    expect(FinancingContractsService).toBeDefined();
    expect(FinancingContractsController).toBeDefined();
  });

  it('should have FINANCING_CONTRACT resource', () => {
    expect(Resource.FINANCING_CONTRACT).toBe('financing_contract');
  });

  it('should have APPROVE action', () => {
    expect(Action.APPROVE).toBe('approve');
  });

  it('should have service methods', () => {
    const service = new FinancingContractsService(null as any);
    expect(typeof service.create).toBe('function');
    expect(typeof service.findAll).toBe('function');
    expect(typeof service.findOne).toBe('function');
    expect(typeof service.updateStatus).toBe('function');
    expect(typeof service.approve).toBe('function');
  });

  it('should have controller methods', () => {
    const controller = new FinancingContractsController(null as any);
    expect(typeof controller.create).toBe('function');
    expect(typeof controller.findAll).toBe('function');
    expect(typeof controller.findOne).toBe('function');
    expect(typeof controller.updateStatus).toBe('function');
    expect(typeof controller.approve).toBe('function');
  });
});
