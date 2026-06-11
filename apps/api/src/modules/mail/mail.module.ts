import { Global, Module } from '@nestjs/common'
import { MailService } from './mail.service'

// Global: lo usan auth (reset) y usuarios (invitacion) sin import explicito
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
