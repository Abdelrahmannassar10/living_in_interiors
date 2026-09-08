import { NestFactory, Reflector } from '@nestjs/core';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const reflector = app.get(Reflector);
  const apiPrefix = process.env.API_PREFIX ?? 'api/v1';
  const port = Number(process.env.PORT ?? 3000);

  app.setGlobalPrefix(apiPrefix);
  (app.getHttpAdapter().getInstance() as import('express').Express).set('trust proxy', 1);
  app.use(helmet());
  app.enableCors({
    origin: process.env.CORS_ALLOW_ALL === 'true'
      ? true
      : (process.env.ALLOWED_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean),
  });
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1000,
  }));
  // Stricter limiter for credential endpoints.
  app.use(`${apiPrefix}/auth`, rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
  }));
  // ClassSerializer first so entities are plain + @Exclude-stripped before the envelope wraps them.
  app.useGlobalInterceptors(new ClassSerializerInterceptor(reflector), new ResponseTransformInterceptor(), new LoggingInterceptor());
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  app.useGlobalFilters(new GlobalExceptionFilter());

  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Living In interiors API')
      .setDescription('Luxury furniture management backend')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  await app.listen(port, '0.0.0.0');
}
bootstrap();
