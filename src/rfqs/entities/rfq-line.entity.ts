import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Item } from '../../items/entities/item.entity';
import { Rfq } from './rfq.entity';

@Entity('rfq_lines')
export class RfqLine {
  @PrimaryGeneratedColumn() id!: number;
  @ManyToOne(() => Rfq, (rfq) => rfq.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rfq_id' })
  rfq!: Rfq;
  @Column({ name: 'sort_order', default: 0 }) sortOrder!: number;
  @ManyToOne(() => Item, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'item_id' })
  item!: Item | null;
  @Column({
    name: 'code_snapshot',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  codeSnapshot!: string | null;
  @Column({
    name: 'description_snapshot',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  descriptionSnapshot!: string | null;
  @Column({ default: 1 }) qty!: number;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({
    name: 'unit_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  unitPrice!: string | null;
  @Column({ name: 'lead_time_days', type: 'int', nullable: true })
  leadTimeDays!: number | null;
  @Column({ name: 'is_deleted', default: false }) isDeleted!: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
