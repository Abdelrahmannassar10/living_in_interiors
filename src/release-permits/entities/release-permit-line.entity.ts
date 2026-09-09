import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Item } from '../../items/entities/item.entity';
import { SalesOrderLine } from '../../sales-orders/entities/sales-order-line.entity';
import { ReleasePermit } from './release-permit.entity';

@Entity('release_permit_lines')
export class ReleasePermitLine {
  @PrimaryGeneratedColumn() id!: number;
  @ManyToOne(() => ReleasePermit, (permit) => permit.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'release_permit_id' })
  releasePermit!: ReleasePermit;
  @ManyToOne(() => SalesOrderLine, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sales_order_line_id' })
  salesOrderLine!: SalesOrderLine;
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
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
