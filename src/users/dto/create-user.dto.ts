import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { Role } from '../../common/enums/role.enum';

/** Min 8 chars, at least one letter and one digit. */
export class PasswordPolicy {
  @Transform(({ value }) => String(value))
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/[A-Za-z]/, { message: 'Password must contain a letter' })
  @Matches(/\d/, { message: 'Password must contain a digit' })
  password!: string;
}

export class CreateUserDto extends PasswordPolicy {
  @IsString() @IsNotEmpty() username!: string;
  @IsString() @IsNotEmpty() fullName!: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
