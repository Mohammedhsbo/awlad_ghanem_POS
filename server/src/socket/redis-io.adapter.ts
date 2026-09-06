import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { createSocketAuthMiddleware } from './auth.js';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | undefined;

  constructor(private app: INestApplication) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    if (!process.env.REDIS_URL) {
      console.warn('Redis unavailable; skipping Redis adapter for WebSockets.');
      return;
    }

    const pubClient = createClient({ url: process.env.REDIS_URL });
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) => console.error('Redis PubClient error', err));
    subClient.on('error', (err) => console.error('Redis SubClient error', err));

    try {
      await Promise.all([pubClient.connect(), subClient.connect()]);
      this.adapterConstructor = createAdapter(pubClient, subClient);
    } catch (error) {
      console.warn('Failed to connect to Redis for WebSockets. Falling back to default adapter.');
    }
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    
    // Add Redis adapter if available
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }

    // Apply authentication middleware
    const prismaService = this.app.get(PrismaService);
    server.use(createSocketAuthMiddleware(prismaService));

    return server;
  }
}
