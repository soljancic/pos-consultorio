import { Type } from 'class-transformer'
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min, Max } from 'class-validator'
import { EstadoLiquidacion } from '@prisma/client'

export class LiquidacionFiltersDto {
  @IsOptional() @IsDateString()
  desde?: string

  @IsOptional() @IsDateString()
  hasta?: string

  @IsOptional() @Type(() => Number) @IsInt()
  aseguradoraId?: number

  @IsOptional() @Type(() => Number) @IsInt()
  pacienteId?: number

  @IsOptional() @IsEnum(EstadoLiquidacion)
  estado?: EstadoLiquidacion

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize?: number = 25

  // export='1' => todas las filas (sin paginar) para el ExportButtons del front
  @IsOptional() @IsString()
  export?: string
}
