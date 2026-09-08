import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  const query = jest.fn();

  beforeEach(async () => {
    query.mockReset();
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: DataSource, useValue: { query } }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('reports ok with DB latency when the ping succeeds', async () => {
      query.mockResolvedValue([{ now: '2026-01-01T00:00:00.000Z' }]);
      const health = await appController.getHealth();
      expect(health.status).toBe('ok');
      expect(health.db.up).toBe(true);
      expect(health.db.latencyMs).toBeGreaterThanOrEqual(0);
      expect(query).toHaveBeenCalled();
    });

    it('reports degraded without throwing when the DB is unreachable', async () => {
      query.mockRejectedValue(new Error('connection refused'));
      const health = await appController.getHealth();
      expect(health.status).toBe('degraded');
      expect(health.db.up).toBe(false);
      expect(health.db.error).toContain('connection refused');
    });
  });
});
