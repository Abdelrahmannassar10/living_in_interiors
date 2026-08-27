import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { LocationType } from '../../common/enums/location-type.enum';

export class CreateLocationDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsOptional() @IsEnum(LocationType) type?: LocationType;
  @IsOptional() @IsBoolean() isPhysical?: boolean;
  @IsOptional() @IsString() notes?: string;
}