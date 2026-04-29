import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { AuthGuard } from "./auth/auth.guard";
import { TenantModule } from "./tenant/tenant.module";
import { TenantGuard } from "./tenant/tenant.guard";
import { HealthController } from "./health/health.controller";
import { SalonsModule } from "./salons/salons.module";
import { StaffModule } from "./staff/staff.module";
import { ServicesModule } from "./services/services.module";
import { ClientsModule } from "./clients/clients.module";
import { AppointmentsModule } from "./appointments/appointments.module";
import { OutboxModule } from "./outbox/outbox.module";
import { SettingsModule } from "./settings/settings.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { MessagingModule } from "./messaging/messaging.module";
import { PaymentsModule } from "./payments/payments.module";

// AuthGuard runs first; TenantGuard depends on the identity it attaches to
// the request. Order matters: Nest evaluates global guards in registration
// order.
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    TenantModule,
    SalonsModule,
    StaffModule,
    ServicesModule,
    ClientsModule,
    AppointmentsModule,
    MessagingModule,
    PaymentsModule,
    OutboxModule,
    SettingsModule,
    WebhooksModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
})
export class AppModule {}
