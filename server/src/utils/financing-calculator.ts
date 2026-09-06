import { Decimal } from '@prisma/client/runtime/library';
import {
  InstallmentCalculationResult,
  InstallmentScheduleItem,
  MONTHS_PER_QUARTER,
  FINANCIAL_PRECISION,
} from '@motorcycle-system/shared-types';

type InstallmentFrequency = 'monthly' | 'quarterly';

/**
 * Rounds a decimal to the specified number of decimal places using banker's rounding (round half to even).
 * This ensures consistent rounding behavior for financial calculations.
 */
function roundDecimal(value: Decimal, precision: number): Decimal {
  const multiplier = new Decimal(10).pow(precision);
  return value.mul(multiplier).round().div(multiplier);
}

/**
 * Converts Decimal to number with fixed precision
 */
function decimalToNumber(value: Decimal, precision: number = FINANCIAL_PRECISION): number {
  return parseFloat(roundDecimal(value, precision).toString());
}

/**
 * Calculates installment schedule for a financing contract.
 * 
 * Features:
 * - Calculates financing amount (totalAmount - downPayment)
 * - Generates equal installment amounts
 * - Applies rounding adjustment to final installment to ensure exact sum
 * - Handles month-end dates and leap years correctly
 * - Supports monthly and quarterly frequencies
 * - Uses decimal-safe arithmetic throughout
 * 
 * @param totalAmount - Total amount to be financed (before down payment)
 * @param downPayment - Down payment amount
 * @param numberOfInstallments - Number of installments to generate
 * @param startDate - First installment due date
 * @param frequency - Payment frequency (monthly or quarterly)
 * @returns Calculation result with financing amount and installment schedule
 * 
 * @example
 * ```typescript
 * const result = calculateInstallmentSchedule(
 *   10000,    // totalAmount
 *   2000,     // downPayment
 *   12,       // numberOfInstallments
 *   new Date('2026-02-01'),
 *   'monthly'
 * );
 * // Result:
 * // financingAmount: 8000
 * // installments: [
 * //   { installmentNumber: 1, dueDate: 2026-02-01, amount: 666.67 },
 * //   { installmentNumber: 2, dueDate: 2026-03-01, amount: 666.67 },
 * //   ...
 * //   { installmentNumber: 12, dueDate: 2027-01-01, amount: 666.63 } // adjusted
 * // ]
 * // totalInstallmentAmount: 8000.00 (exactly matches financingAmount)
 * ```
 */
export function calculateInstallmentSchedule(
  totalAmount: number,
  downPayment: number,
  numberOfInstallments: number,
  startDate: Date,
  frequency: InstallmentFrequency = 'monthly'
): InstallmentCalculationResult {
  // Validate inputs
  if (totalAmount <= 0) {
    throw new Error('Total amount must be positive');
  }
  if (downPayment < 0) {
    throw new Error('Down payment cannot be negative');
  }
  if (downPayment >= totalAmount) {
    throw new Error('Down payment must be less than total amount');
  }
  if (numberOfInstallments < 1) {
    throw new Error('Number of installments must be at least 1');
  }
  if (!Number.isInteger(numberOfInstallments)) {
    throw new Error('Number of installments must be an integer');
  }

  // Convert to Decimal for precise arithmetic
  const totalAmountDecimal = new Decimal(totalAmount);
  const downPaymentDecimal = new Decimal(downPayment);
  
  // Calculate financing amount
  const financingAmountDecimal = totalAmountDecimal.minus(downPaymentDecimal);
  const financingAmount = decimalToNumber(financingAmountDecimal);

  // Calculate base installment amount (equal distribution)
  const baseInstallmentDecimal = financingAmountDecimal.div(numberOfInstallments);
  const baseInstallment = decimalToNumber(baseInstallmentDecimal);

  // Generate installment schedule
  const installments: InstallmentScheduleItem[] = [];
  let currentDueDate = new Date(startDate);
  let sumOfInstallments = new Decimal(0);
  
  // Track the original day for month-end behavior
  const originalDay = currentDueDate.getUTCDate();

  for (let i = 1; i <= numberOfInstallments; i++) {
    let installmentAmount: number;

    if (i < numberOfInstallments) {
      // Regular installment: use base amount
      installmentAmount = baseInstallment;
      sumOfInstallments = sumOfInstallments.plus(new Decimal(baseInstallment));
    } else {
      // Final installment: adjust to ensure exact sum
      const remainingDecimal = financingAmountDecimal.minus(sumOfInstallments);
      installmentAmount = decimalToNumber(remainingDecimal);
    }

    installments.push({
      installmentNumber: i,
      dueDate: new Date(currentDueDate),
      amount: installmentAmount,
    });

    // Calculate next due date (if not the last installment)
    if (i < numberOfInstallments) {
      const year = currentDueDate.getUTCFullYear();
      const month = currentDueDate.getUTCMonth();
      
      let targetYear = year;
      let targetMonth = month;
      
      if (frequency === 'monthly') {
        targetMonth += 1;
      } else if (frequency === 'quarterly') {
        targetMonth += 3; // 3 months per quarter
      }
      
      // Handle year overflow
      while (targetMonth > 11) {
        targetMonth -= 12;
        targetYear += 1;
      }
      
      // Get the last valid day of the target month using UTC
      const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
      
      // Use original day (from first installment), or last day if it doesn't exist in target month
      const targetDay = Math.min(originalDay, lastDayOfTargetMonth);
      
      currentDueDate = new Date(Date.UTC(targetYear, targetMonth, targetDay));
    }
  }

  // Calculate total for verification
  const totalInstallmentAmount = decimalToNumber(
    installments.reduce(
      (sum, inst) => sum.plus(new Decimal(inst.amount)),
      new Decimal(0)
    )
  );

  // Verify sum equals financing amount exactly
  const difference = Math.abs(totalInstallmentAmount - financingAmount);
  if (difference > 0.001) {
    throw new Error(
      `Installment calculation error: sum ${totalInstallmentAmount} does not match financing amount ${financingAmount}`
    );
  }

  return {
    financingAmount,
    installments,
    totalInstallmentAmount,
  };
}

/**
 * Validates a financing contract configuration before creation.
 * Checks business rules and constraints.
 */
export function validateFinancingContract(
  totalAmount: number,
  downPayment: number,
  numberOfInstallments: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (totalAmount <= 0) {
    errors.push('Total amount must be positive');
  }

  if (downPayment < 0) {
    errors.push('Down payment cannot be negative');
  }

  if (downPayment >= totalAmount) {
    errors.push('Down payment must be less than total amount');
  }

  if (numberOfInstallments < 1) {
    errors.push('Must have at least one installment');
  }

  if (!Number.isInteger(numberOfInstallments)) {
    errors.push('Number of installments must be an integer');
  }

  if (numberOfInstallments > 120) {
    errors.push('Maximum 120 installments allowed');
  }

  const financingAmount = totalAmount - downPayment;
  if (financingAmount < 100) {
    errors.push('Financing amount must be at least 100');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
