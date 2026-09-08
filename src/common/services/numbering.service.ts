import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { NumberSequence } from '../entities/number-sequence.entity';

/**
 * Race-free document numbering. The sequence row is locked with
 * SELECT ... FOR UPDATE inside the caller's transaction, so two concurrent
 * creations can never receive the same number. Gaps after rollbacks are
 * possible by design and are acceptable for document numbers.
 */
@Injectable()
export class NumberingService {
  /**
   * @param initValue called only when the scope row does not exist yet; should
   * derive the last used number from existing documents so sequences stay continuous.
   */
  async next(
    manager: EntityManager,
    scope: string,
    format: (value: number) => string,
    initValue: () => Promise<number>,
  ): Promise<string> {
    let row = await manager.findOne(NumberSequence, {
      where: { scope },
      lock: { mode: 'pessimistic_write' },
    });
    if (!row) {
      row = manager.create(NumberSequence, {
        scope,
        nextValue: (await initValue()) + 1,
      });
      await manager.save(row);
      return format(row.nextValue);
    }
    row.nextValue += 1;
    await manager.save(row);
    return format(row.nextValue);
  }
}
