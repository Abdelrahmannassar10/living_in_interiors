import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class CreateFromSuggestionsDto {
  /** Reorder only these item ids; defaults to every currently stock-low item. */
  @IsOptional() @IsArray() @IsInt({ each: true }) itemIds?: number[];
  /** Force every created PO to use one supplier (skips items of other suppliers). */
  @IsOptional() @IsInt() @IsPositive() supplierId?: number;
  @IsOptional() @IsDateString() expectedDate?: string;
  @IsOptional() @IsString() notes?: string;
}
