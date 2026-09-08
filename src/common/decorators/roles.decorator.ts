import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';
/** Routes without @Roles() are open to any authenticated user. Admin always bypasses. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
