import { Inject, Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CustomersService } from '../customers/customers.service.js';
import {
  OfflineOperationType,
  QueueOfflineOperationDto,
  OfflineSyncStatus,
  QueuedOperation,
  POSErrorCode,
} from '@motorcycle-system/shared-types';
import type { AuthenticatedUser } from '../common/types/authenticated-request.js';

/** Cap on operations still waiting to sync, per user. */
const MAX_QUEUE_SIZE = 10;
/** Cap on retained history (synced/failed) per user, so the map stays bounded. */
const MAX_RETAINED_OPERATIONS = 100;
/** Cap on the reported conflict list, newest kept. */
const MAX_RETAINED_CONFLICTS = 200;
const MAX_OPERATION_SIZE_BYTES = 10 * 1024; // 10KB
const OPERATION_EXPIRATION_HOURS = 24;

@Injectable()
export class OfflineService {
  // In-memory queue (in production, use Redis or database table)
  private operationQueue = new Map<
    string,
    Array<{
      id: string;
      type: OfflineOperationType;
      data: any;
      status: 'pending' | 'synced' | 'failed';
      createdAt: Date;
      expiresAt: Date;
      userId: string;
      branchId: string;
    }>
  >();

  private conflicts: Array<{
    operationId: string;
    type: string;
    reason: string;
    resolution: string;
  }> = [];

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CustomersService) private readonly customersService: CustomersService,
  ) {
    // Clean up expired operations every hour
    setInterval(() => this.cleanupExpiredOperations(), 60 * 60 * 1000);
  }

  async getSyncStatus(userId: string): Promise<OfflineSyncStatus> {
    const userQueue = this.operationQueue.get(userId) || [];
    const pendingOps = userQueue.filter((op) => op.status === 'pending');

    // Check last sync by looking at most recent synced operation
    const lastSynced = userQueue
      .filter((op) => op.status === 'synced')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    return {
      isOnline: true, // Server is online if this endpoint responds
      lastSyncAt: lastSynced?.createdAt.toISOString(),
      queuedOperations: pendingOps.length,
      syncInProgress: false,
      conflicts: this.conflicts.filter((c) =>
        userQueue.some((op) => op.id === c.operationId)
      ),
    };
  }

  async queueOperation(
    dto: QueueOfflineOperationDto,
    user: AuthenticatedUser,
  ): Promise<{ queueId: string; position: number }> {
    // Validate operation type
    if (
      dto.type !== OfflineOperationType.CUSTOMER_CREATE &&
      dto.type !== OfflineOperationType.CUSTOMER_UPDATE
    ) {
      throw new BadRequestException({
        code: POSErrorCode.INVALID_OFFLINE_OPERATION,
        message: 'Only customer operations can be queued offline',
      });
    }

    // Check queue size limit
    const userQueue = this.pruneQueue(user.id);
    const pendingOps = userQueue.filter((op) => op.status === 'pending');

    if (pendingOps.length >= MAX_QUEUE_SIZE) {
      throw new ConflictException({
        code: POSErrorCode.QUEUE_LIMIT_EXCEEDED,
        message: `Queue limit exceeded. Maximum ${MAX_QUEUE_SIZE} operations allowed`,
      });
    }

    // Check operation size
    const operationSize = JSON.stringify(dto.data).length;
    if (operationSize > MAX_OPERATION_SIZE_BYTES) {
      throw new BadRequestException({
        code: POSErrorCode.OPERATION_TOO_LARGE,
        message: `Operation size exceeds ${MAX_OPERATION_SIZE_BYTES} bytes`,
      });
    }

    // Create operation
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OPERATION_EXPIRATION_HOURS * 60 * 60 * 1000);

    const operation = {
      id: `offline-${user.id}-${Date.now()}`,
      type: dto.type,
      data: dto.data,
      status: 'pending' as const,
      createdAt: now,
      expiresAt,
      userId: user.id,
      branchId: user.branchId || '',
    };

    userQueue.push(operation);
    this.operationQueue.set(user.id, userQueue);

    // Immediately attempt to sync
    await this.processPendingOperations(user);
    this.pruneQueue(user.id);

    return {
      queueId: operation.id,
      position: pendingOps.length + 1,
    };
  }

  /**
   * Drops operations that have reached a terminal state and aged past their
   * expiry, then trims retained history. Returns the surviving queue.
   */
  private pruneQueue(userId: string) {
    const now = Date.now();
    const queue = (this.operationQueue.get(userId) || []).filter(
      (op) => op.status === 'pending' || op.expiresAt.getTime() > now,
    );

    const trimmed = queue.length > MAX_RETAINED_OPERATIONS
      ? queue.slice(queue.length - MAX_RETAINED_OPERATIONS)
      : queue;

    this.operationQueue.set(userId, trimmed);
    return trimmed;
  }

  private pushConflict(conflict: {
    operationId: string;
    type: string;
    reason: string;
    resolution: string;
  }) {
    this.conflicts.push(conflict);
    if (this.conflicts.length > MAX_RETAINED_CONFLICTS) {
      this.conflicts.splice(0, this.conflicts.length - MAX_RETAINED_CONFLICTS);
    }
  }

  async getQueuedOperations(userId: string): Promise<QueuedOperation[]> {
    const userQueue = this.operationQueue.get(userId) || [];

    return userQueue.map((op) => ({
      id: op.id,
      type: op.type,
      data: op.data,
      status: op.status,
      createdAt: op.createdAt.toISOString(),
      expiresAt: op.expiresAt.toISOString(),
    }));
  }

  private async processPendingOperations(user: AuthenticatedUser): Promise<void> {
    const userQueue = this.operationQueue.get(user.id) || [];
    const pendingOps = userQueue.filter((op) => op.status === 'pending');

    for (const op of pendingOps) {
      try {
        // Check if expired
        if (new Date() > op.expiresAt) {
          op.status = 'failed';
          this.pushConflict({
            operationId: op.id,
            type: op.type,
            reason: 'Operation expired',
            resolution: 'Operation was not synced within 24 hours',
          });
          continue;
        }

        // Process operation
        if (op.type === OfflineOperationType.CUSTOMER_CREATE) {
          await this.processCustomerCreate(op, user);
        } else if (op.type === OfflineOperationType.CUSTOMER_UPDATE) {
          await this.processCustomerUpdate(op, user);
        }

        op.status = 'synced';
      } catch (error: any) {
        op.status = 'failed';
        this.pushConflict({
          operationId: op.id,
          type: op.type,
          reason: error.message || 'Unknown error',
          resolution: 'Manual intervention required',
        });
      }
    }

    this.operationQueue.set(user.id, userQueue);
  }

  private async processCustomerCreate(
    operation: any,
    user: AuthenticatedUser,
  ): Promise<void> {
    const { data } = operation;

    // Check for duplicate customer by phone
    const existing = await this.prisma.customer.findFirst({
      where: {
        phone: data.phone,
      },
    });

    if (existing) {
      // Duplicate detected - server state wins
      this.pushConflict({
        operationId: operation.id,
        type: operation.type,
        reason: 'Customer with this phone already exists',
        resolution: 'Used existing customer record',
      });
      return;
    }

    // Create customer
    await this.customersService.create(data, user);
  }

  private async processCustomerUpdate(
    operation: any,
    user: AuthenticatedUser,
  ): Promise<void> {
    const { data } = operation;
    const { customerId, ...updateData } = data;

    // Fetch current server state
    const serverCustomer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!serverCustomer) {
      throw new Error('Customer not found on server');
    }

    // Check if server was modified after offline operation
    const serverModifiedAt = serverCustomer.updatedAt;
    const offlineTimestamp = new Date(operation.data.timestamp || operation.createdAt);

    if (serverModifiedAt > offlineTimestamp) {
      // Conflict: server state is newer - server wins
      this.pushConflict({
        operationId: operation.id,
        type: operation.type,
        reason: 'Server data was modified after offline operation',
        resolution: 'Server state preserved, offline changes discarded',
      });
      return;
    }

    // Apply update
    await this.customersService.update(customerId, updateData, user);
  }

  private cleanupExpiredOperations(): void {
    const now = new Date();

    for (const [userId, queue] of this.operationQueue.entries()) {
      const validOps = queue.filter((op) => {
        if (now > op.expiresAt) {
          if (op.status === 'pending') {
            this.pushConflict({
              operationId: op.id,
              type: op.type,
              reason: 'Operation expired',
              resolution: 'Removed from queue',
            });
          }
          return false;
        }
        return true;
      });

      if (validOps.length === 0) {
        this.operationQueue.delete(userId);
      } else {
        this.operationQueue.set(userId, validOps);
      }
    }

    // Clean old conflicts (keep last 100)
    if (this.conflicts.length > 100) {
      this.conflicts = this.conflicts.slice(-100);
    }
  }
}
