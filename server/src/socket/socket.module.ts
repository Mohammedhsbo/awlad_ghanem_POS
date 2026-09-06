import { Module, Global } from '@nestjs/common';
import { SocketGateway } from './socket.gateway.js';

@Global()
@Module({
  providers: [SocketGateway],
  exports: [SocketGateway],
})
export class SocketModule {}
