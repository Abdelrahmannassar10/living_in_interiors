import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBrandDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() notes?: string;
}
