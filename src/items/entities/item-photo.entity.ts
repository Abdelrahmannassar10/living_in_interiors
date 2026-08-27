import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Item } from './item.entity';

@Entity('item_photos')
export class ItemPhoto {
  @PrimaryGeneratedColumn() id!: number;
  @ManyToOne(() => Item, (item) => item.photos, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'item_id' }) item!: Item;
  @Column({ name: 'file_name', length: 500 }) fileName!: string;
  @Column({ name: 'public_id', length: 1000 }) publicId!: string;
  @Column({ name: 'file_url', length: 1000 }) fileUrl!: string;
  @Column({ name: 'thumbnail_url', type: 'varchar', length: 1000, nullable: true }) thumbnailUrl!: string | null;
  @Column({ name: 'file_size', type: 'integer', nullable: true }) fileSize!: number | null;
  @Column({ name: 'mime_type', type: 'varchar', length: 100, nullable: true }) mimeType!: string | null;
  @Column({ name: 'is_primary', default: false }) isPrimary!: boolean;
  @Column({ name: 'sort_order', default: 0 }) sortOrder!: number;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}