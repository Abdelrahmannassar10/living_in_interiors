import { Logger, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WsEvents } from './events.enum';

/**
 * Realtime event gateway. Connections must present a valid access JWT
 * (handshake auth token); sockets join role/item/location rooms.
 */
@WebSocketGateway({ transports: ['websocket', 'polling'] })
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(AppGateway.name);

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token = (client.handshake.auth?.token ?? client.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '')) as string | undefined;
      if (!token) throw new UnauthorizedException('Missing token');
      const payload = await this.jwt.verifyAsync<{ sub: number; role: string }>(token);
      client.data.userId = payload.sub;
      client.data.role = payload.role;
      client.join(`role:${payload.role}`);
      client.join(`user:${payload.sub}`);
      client.emit(WsEvents.CONNECTED, { message: 'Connected to Living In interiors API' });
    } catch (error) {
      this.logger.warn(`Socket rejected: ${error instanceof Error ? error.message : 'unknown'}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) { this.logger.debug(`Socket disconnected: ${client.id}`); }

  emitStockUpdated(itemCode: string, stock: unknown) { this.server.to(`item:${itemCode}`).emit(WsEvents.STOCK_UPDATED, { itemCode, stock }); }
  emitStockAlert(itemCode: string, description: string | null, totalQty: number, threshold: number) { this.server.emit(WsEvents.STOCK_ALERT, { itemCode, description, totalQty, threshold }); }
  emitTransactionCreated(transactionId: number, type: string, itemCode: string, qty: number) { this.server.emit(WsEvents.TRANSACTION_CREATED, { transactionId, type, itemCode, qty }); }
  emitQuotationEvent(event: WsEvents, payload: object) { this.server.emit(event, payload); }
  emitItemEvent(event: WsEvents, payload: object) { this.server.emit(event, payload); }
}
