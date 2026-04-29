import { Global, Module, type Provider } from "@nestjs/common";
import { env } from "../env";
import { AUTH_PROVIDER } from "./auth-provider.interface";
import { DevAuthProvider } from "./dev-auth.provider";
import { ClerkAuthProvider } from "./clerk-auth.provider";

const authProviderFactory: Provider = {
  provide: AUTH_PROVIDER,
  useFactory: () => {
    switch (env.AUTH_PROVIDER) {
      case "dev":
        return new DevAuthProvider();
      case "clerk":
        return new ClerkAuthProvider();
    }
  },
};

@Global()
@Module({
  providers: [authProviderFactory, DevAuthProvider, ClerkAuthProvider],
  exports: [AUTH_PROVIDER],
})
export class AuthModule {}
