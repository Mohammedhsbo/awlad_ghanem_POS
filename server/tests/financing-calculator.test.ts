import { describe, it, expect } from 'vitest';
import {
  calculateInstallmentSchedule,
  validateFinancingContract,
} from '../src/utils/financing-calculator.js';

/**
 * Formats a Date as a date-only string (YYYY-MM-DD) in UTC.
 * Used for comparing calendar dates without timezone shifts.
 */
function formatDateOnly(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Creates a Date from a date-only string (YYYY-MM-DD) in UTC.
 * Ensures consistent date-only semantics across timezones.
 */
function parseDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

describe('Financing Calculator', () => {
  describe('calculateInstallmentSchedule', () => {
    it('should calculate equal monthly installments correctly', () => {
      const result = calculateInstallmentSchedule(
        10000, // totalAmount
        2000, // downPayment
        12, // numberOfInstallments
        parseDate('2026-01-15'),
        'monthly' as any
      );

      expect(result.financingAmount).toBe(8000);
      expect(result.installments).toHaveLength(12);
      expect(result.totalInstallmentAmount).toBe(8000);

      // First installment
      expect(result.installments[0].installmentNumber).toBe(1);
      expect(formatDateOnly(result.installments[0].dueDate)).toBe('2026-01-15');
      expect(result.installments[0].amount).toBe(666.67);

      // Second installment
      expect(result.installments[1].installmentNumber).toBe(2);
      expect(formatDateOnly(result.installments[1].dueDate)).toBe('2026-02-15');
      expect(result.installments[1].amount).toBe(666.67);

      // Last installment should have rounding adjustment
      expect(result.installments[11].installmentNumber).toBe(12);
      expect(result.installments[11].amount).toBe(666.63); // adjusted for exact sum
    });

    it('should calculate quarterly installments correctly', () => {
      const result = calculateInstallmentSchedule(
        12000,
        3000,
        4, // 4 quarters = 1 year
        parseDate('2026-01-01'),
        'quarterly' as any
      );

      expect(result.financingAmount).toBe(9000);
      expect(result.installments).toHaveLength(4);
      expect(result.totalInstallmentAmount).toBe(9000);

      // Check quarterly spacing
      expect(formatDateOnly(result.installments[0].dueDate)).toBe('2026-01-01');
      expect(formatDateOnly(result.installments[1].dueDate)).toBe('2026-04-01');
      expect(formatDateOnly(result.installments[2].dueDate)).toBe('2026-07-01');
      expect(formatDateOnly(result.installments[3].dueDate)).toBe('2026-10-01');

      // Check amounts
      expect(result.installments[0].amount).toBe(2250);
      expect(result.installments[1].amount).toBe(2250);
      expect(result.installments[2].amount).toBe(2250);
      expect(result.installments[3].amount).toBe(2250);
    });

    it('should handle month-end dates correctly (Jan 31 → Feb 28/29)', () => {
      const result = calculateInstallmentSchedule(
        6000,
        0,
        3,
        parseDate('2026-01-31'), // January 31
        'monthly' as any
      );

      expect(formatDateOnly(result.installments[0].dueDate)).toBe('2026-01-31');
      expect(formatDateOnly(result.installments[1].dueDate)).toBe('2026-02-28'); // Feb has only 28 days
      expect(formatDateOnly(result.installments[2].dueDate)).toBe('2026-03-31'); // Back to 31st
    });

    it('should handle leap year correctly (Jan 31 2028 → Feb 29 2028)', () => {
      const result = calculateInstallmentSchedule(
        6000,
        0,
        3,
        parseDate('2028-01-31'), // January 31, 2028 (leap year)
        'monthly' as any
      );

      expect(formatDateOnly(result.installments[0].dueDate)).toBe('2028-01-31');
      expect(formatDateOnly(result.installments[1].dueDate)).toBe('2028-02-29'); // Feb 29 in leap year
      expect(formatDateOnly(result.installments[2].dueDate)).toBe('2028-03-31'); // Back to 31st
    });

    it('should handle month-end for months with 30 days (Jan 31 → Apr 30)', () => {
      const result = calculateInstallmentSchedule(
        4000,
        0,
        4,
        parseDate('2026-01-31'),
        'monthly' as any
      );

      expect(formatDateOnly(result.installments[0].dueDate)).toBe('2026-01-31');
      expect(formatDateOnly(result.installments[1].dueDate)).toBe('2026-02-28');
      expect(formatDateOnly(result.installments[2].dueDate)).toBe('2026-03-31');
      expect(formatDateOnly(result.installments[3].dueDate)).toBe('2026-04-30'); // April has only 30 days
    });

    it('should ensure sum equals financing amount exactly with rounding', () => {
      const result = calculateInstallmentSchedule(
        1000,
        100,
        3,
        parseDate('2026-01-01'),
        'monthly' as any
      );

      expect(result.financingAmount).toBe(900);
      expect(result.totalInstallmentAmount).toBe(900);

      // Verify sum manually
      const sum = result.installments.reduce((acc, inst) => acc + inst.amount, 0);
      expect(sum).toBe(900);
    });

    it('should handle single installment correctly', () => {
      const result = calculateInstallmentSchedule(
        5000,
        1000,
        1,
        parseDate('2026-01-01'),
        'monthly' as any
      );

      expect(result.financingAmount).toBe(4000);
      expect(result.installments).toHaveLength(1);
      expect(result.installments[0].amount).toBe(4000);
      expect(result.totalInstallmentAmount).toBe(4000);
    });

    it('should handle zero down payment', () => {
      const result = calculateInstallmentSchedule(
        1200,
        0,
        12,
        parseDate('2026-01-01'),
        'monthly' as any
      );

      expect(result.financingAmount).toBe(1200);
      expect(result.totalInstallmentAmount).toBe(1200);
    });

    it('should throw error for negative total amount', () => {
      expect(() =>
        calculateInstallmentSchedule(-1000, 0, 12, parseDate('2026-01-01'), 'monthly' as any)
      ).toThrow('Total amount must be positive');
    });

    it('should throw error for negative down payment', () => {
      expect(() =>
        calculateInstallmentSchedule(1000, -100, 12, parseDate('2026-01-01'), 'monthly' as any)
      ).toThrow('Down payment cannot be negative');
    });

    it('should throw error when down payment >= total amount', () => {
      expect(() =>
        calculateInstallmentSchedule(1000, 1000, 12, parseDate('2026-01-01'), 'monthly' as any)
      ).toThrow('Down payment must be less than total amount');

      expect(() =>
        calculateInstallmentSchedule(1000, 1500, 12, parseDate('2026-01-01'), 'monthly' as any)
      ).toThrow('Down payment must be less than total amount');
    });

    it('should throw error for zero or negative installments', () => {
      expect(() =>
        calculateInstallmentSchedule(1000, 0, 0, parseDate('2026-01-01'), 'monthly' as any)
      ).toThrow('Number of installments must be at least 1');

      expect(() =>
        calculateInstallmentSchedule(1000, 0, -5, parseDate('2026-01-01'), 'monthly' as any)
      ).toThrow('Number of installments must be at least 1');
    });

    it('should throw error for non-integer installments', () => {
      expect(() =>
        calculateInstallmentSchedule(1000, 0, 12.5, parseDate('2026-01-01'), 'monthly' as any)
      ).toThrow('Number of installments must be an integer');
    });

    it('should handle complex rounding scenario with many installments', () => {
      const result = calculateInstallmentSchedule(
        10000,
        333.33,
        48, // 4 years monthly
        parseDate('2026-01-01'),
        'monthly' as any
      );

      expect(result.financingAmount).toBe(9666.67);
      expect(result.totalInstallmentAmount).toBe(9666.67);

      // Verify sum
      const sum = result.installments.reduce((acc, inst) => acc + inst.amount, 0);
      expect(Math.abs(sum - result.financingAmount)).toBeLessThan(0.01);
    });
  });

  describe('validateFinancingContract', () => {
    it('should validate correct financing configuration', () => {
      const result = validateFinancingContract(10000, 2000, 12);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject negative total amount', () => {
      const result = validateFinancingContract(-1000, 0, 12);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Total amount must be positive');
    });

    it('should reject negative down payment', () => {
      const result = validateFinancingContract(1000, -100, 12);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Down payment cannot be negative');
    });

    it('should reject down payment >= total amount', () => {
      const result = validateFinancingContract(1000, 1000, 12);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Down payment must be less than total amount');
    });

    it('should reject zero installments', () => {
      const result = validateFinancingContract(1000, 0, 0);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Must have at least one installment');
    });

    it('should reject too many installments (> 120)', () => {
      const result = validateFinancingContract(100000, 0, 150);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Maximum 120 installments allowed');
    });

    it('should reject non-integer installments', () => {
      const result = validateFinancingContract(1000, 0, 12.5);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Number of installments must be an integer');
    });

    it('should reject financing amount < 100', () => {
      const result = validateFinancingContract(150, 100, 12);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Financing amount must be at least 100');
    });

    it('should collect multiple errors', () => {
      const result = validateFinancingContract(-1000, -100, 0);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
});
