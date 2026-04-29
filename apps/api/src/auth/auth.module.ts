import { Global, Module, type Provider } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { env } from "../env";
import { AUTH_PROVIDER } from "./auth-provider.interface";
import { DevAuthProvider } from "./dev-auth.provider";
import { ClerkAuthProvider } from "./clerk-auth.provider";

const authProviderFactory: Provider = {
  provide: AUTH_PROVIDER,
  inject: [PrismaService],
  useFactory: (prisma: PrismaService) => {
    switch (env.AUTH_PROVIDER) {
      case "dev":
        return new DevAuthProvider();
      case "clerk":
        return new ClerkAuthProvider(prisma);
    }
  },
};

@Global()
@Module({
  imports: [PrismaModule],
  providers: [authProviderFactory, DevAuthProvider, ClerkAuthProvider],
  exports: [AUTH_PROVIDER],
})
export class AuthModule {}
