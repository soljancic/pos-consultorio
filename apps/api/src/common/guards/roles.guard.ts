import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Rol } from '@pos/types'
import { ROLES_KEY } from '../decorators/roles.decorator'
import { JwtPayload } from '../decorators/current-user.decorator'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Rol[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!requiredRoles || requiredRoles.length === 0) return true

    const request = context.switchToHttp().getRequest()
    const user: JwtPayload = request.user

    if (!requiredRoles.includes(user.rol as Rol)) {
      throw new ForbiddenException('No tenes permisos para esta accion')
    }
    return true
  }
}
