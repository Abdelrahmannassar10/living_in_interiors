import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface DbPingResult {
  up: boolean;
  latencyMs: number;
  now?: string;
  error?: string;
}

@Injectable()
export class AppService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  getHello(): string {
    return 'Hello World!';
  }

  /**
   * Real reachability probe: round-trips a trivial query and reports latency so
   * `/health` reflects actual DB connectivity, not just "process is alive".
   */
  async pingDb(): Promise<DbPingResult> {
    const started = Date.now();
    try {
      const rows: Array<{ now: Date | string }> = await this.dataSource.query(
        'SELECT NOW() AS "now"',
      );
      return {
        up: true,
        latencyMs: Date.now() - started,
        now: String(rows[0]?.now),
      };
    } catch (error) {
      return {
        up: false,
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
