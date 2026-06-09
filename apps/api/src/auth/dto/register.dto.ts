import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class RegisterDto {
  @ApiProperty({ example: 'Consultorio San Martin' })
  @IsString()
  @IsNotEmpty()
  consultorioNombre: string

  @ApiProperty({ example: 'Maria Garcia' })
  @IsString()
  @IsNotEmpty()
  adminNombre: string

  @ApiProperty({ example: 'admin@consultorio.com' })
  @IsEmail()
  email: string

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(8)
  password: string

  @ApiPropertyOptional({ example: 'ARS' })
  @IsString()
  @IsOptional()
  moneda?: string

  @ApiPropertyOptional({ example: 'America/Argentina/Buenos_Aires' })
  @IsString()
  @IsOptional()
  timezone?: string
}
