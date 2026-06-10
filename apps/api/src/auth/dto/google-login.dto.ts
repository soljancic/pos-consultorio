import { IsString, IsNotEmpty } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class GoogleLoginDto {
  @ApiProperty({ description: 'ID token devuelto por Google OAuth' })
  @IsString()
  @IsNotEmpty()
  credential: string
}
