import "reflect-metadata";
import "./config/load-env.js";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { RequestMethod } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";
import { AppExceptionFilter } from "./common/filters/app-exception.filter.js";
import { getAllowedOrigins, validateEnvironment } from "./config/env.js";
import { RedisIoAdapter } from "./socket/index.js";

const production = process.env.NODE_ENV === "production";

async function bootstrap() {
  validateEnvironment();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.enableShutdownHooks();

  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  app.setGlobalPrefix("api/v1", {
    exclude: [
      { path: "health/live", method: RequestMethod.GET },
      { path: "health/ready", method: RequestMethod.GET },
      { path: "health/deps", method: RequestMethod.GET },
      { path: "metrics", method: RequestMethod.GET },
    ],
  });
  app.use(helmet({
    contentSecurityPolicy: production ? undefined : false,
    hsts: production ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
  }));
  app.use(cookieParser());
  app.enableCors({
    origin: getAllowedOrigins(),
    credentials: true,
  });
  app.useGlobalFilters(new AppExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Motorcycle System API")
    .setDescription("Backend API serving three separate clients: the Web storefront, the Admin dashboard, and the Desktop POS application.")
    .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" }, "JWT")
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, swaggerDocument);

  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);

  if (!production) {
    console.log(`API listening on http://localhost:${port}/api/v1`);
  }
}

void bootstrap();
