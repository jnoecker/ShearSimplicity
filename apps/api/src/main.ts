import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { env } from "./env";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log"],
    // Required for the Clerk webhook controller to access the unparsed body
    // for svix signature verification. Body parsing still happens for other
    // routes — `rawBody` is just kept alongside the parsed body.
    rawBody: true,
  });

  app.use(cookieParser(env.DEV_AUTH_SECRET));
  app.enableCors({
    origin: env.WEB_ORIGIN,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(env.API_PORT);
  Logger.log(
    `ShearSimplicity API listening on http://localhost:${env.API_PORT}`,
    "Bootstrap",
  );
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
