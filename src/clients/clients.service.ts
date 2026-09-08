import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Quotation } from '../quotations/entities/quotation.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Client } from './entities/client.entity';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client) private readonly clients: Repository<Client>,
    @InjectRepository(Quotation) private readonly quotations: Repository<Quotation>,
    @InjectRepository(Transaction) private readonly transactions: Repository<Transaction>,
  ) {}

  findAll(search?: string) {
    return this.clients.find({
      where: search ? { isActive: true, name: ILike(`%${search}%`) } : { isActive: true },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: number) {
    const client = await this.clients.findOne({ where: { id, isActive: true } });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  create(dto: CreateClientDto, actorId?: number) {
    return this.clients.save(this.clients.create({ ...dto, createdBy: actorId ? { id: actorId } : null }));
  }

  async update(id: number, dto: UpdateClientDto) {
    const client = await this.findOne(id);
    Object.assign(client, dto);
    return this.clients.save(client);
  }

  async deactivate(id: number) {
    const client = await this.findOne(id);
    client.isActive = false;
    await this.clients.save(client);
  }

  /** Quotes and stock movements for this client, newest first. */
  async history(id: number) {
    const client = await this.findOne(id);
    const [quotations, transactions] = await Promise.all([
      this.quotations.find({ where: { client: { id: client.id } }, order: { createdAt: 'DESC' }, take: 50 }),
      this.transactions.createQueryBuilder('transaction')
        .where('transaction.customer_name = :name', { name: client.name })
        .leftJoinAndSelect('transaction.item', 'item')
        .orderBy('transaction.transactionDate', 'DESC')
        .take(50)
        .getMany(),
    ]);
    return { client, quotations, transactions };
  }
}
