import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';
import { 
  MOTORCYCLE_EVENTS, 
  MotorcycleStatusChangedPayload, 
  MotorcycleCreatedPayload, 
  MotorcycleDeletedPayload 
} from './events.js';
import { SocketUser } from './auth.js';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()) ?? true,
    credentials: true,
  },
})
export class SocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    const user = (client.data as { user: SocketUser })?.user;
    if (user) {
      console.log(`Socket connected: ${client.id} (User: ${user.email})`);
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`Socket disconnected: ${client.id}`);
  }

  emitMotorcycleStatusChanged(payload: MotorcycleStatusChangedPayload) {
    this.server.emit(MOTORCYCLE_EVENTS.STATUS_CHANGED, payload);
  }

  emitMotorcycleCreated(payload: MotorcycleCreatedPayload) {
    this.server.emit(MOTORCYCLE_EVENTS.CREATED, payload);
  }

  emitMotorcycleDeleted(payload: MotorcycleDeletedPayload) {
    this.server.emit(MOTORCYCLE_EVENTS.DELETED, payload);
  }
}
