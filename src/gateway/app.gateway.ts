import { Injectable, Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WsEvents } from './events.enum';

@Injectable()
@WebSocketGateway({ cors: { origin: '*' }, transports: ['websocket', 'polling'] })
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(AppGateway.name);
  handleConnection(client: Socket) { client.emit(WsEvents.CONNECTED, { message: 'Connected to Living In interiors API' }); }
  handleDisconnect(client: Socket) { this.logger.debug(`Socket disconnected: ${client.id}`); }
  emitStockUpdated(itemCode: string, stock: unknown) { this.server.emit(WsEvents.STOCK_UPDATED, { itemCode, stock }); }
  emitStockAlert(itemCode: string, description: string | null, totalQty: number, threshold: number) { this.server.emit(WsEvents.STOCK_ALERT, { itemCode, description, totalQty, threshold }); }
  emitTransactionCreated(transactionId: number, type: string, itemCode: string, qty: number) { this.server.emit(WsEvents.TRANSACTION_CREATED, { transactionId, type, itemCode, qty }); }
  emitQuotationEvent(event: WsEvents, payload: object) { this.server.emit(event, payload); }
  emitItemEvent(event: WsEvents, payload: object) { this.server.emit(event, payload); }
}