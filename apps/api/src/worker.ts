import { uuidv7 } from 'uuidv7';
import { PosSyncWorker, postgresRuntime } from '@corebiz/infrastructure';
import { asId, Plan, type TenantId, type UserId } from '@corebiz/domain';
import { systemClock, type PosQueueJobData, type TenantContext } from '@corebiz/application';
import {
  COMMAND_DESERIALIZERS,
  type SyncOperationItem,
} from './modules/pos/controllers/sync-pos-operations.controller';
import { assembleUseCases, type UseCases } from './composition/use-cases.provider';

const redisUrl = process.env.REDIS_URL;
const dbUrl = process.env.DATABASE_URL;

if (!redisUrl || !dbUrl) {
  process.exit(1);
}

const worker = new PosSyncWorker({
  redisUrl,
  concurrency: 2,
  handler: async (data: PosQueueJobData) => {
    const ctx: TenantContext = {
      tenantId: asId<TenantId>(data.tenantId),
      tenantSlug: 'default',
      actor: {
        userId: asId<UserId>(data.userId),
        role: 'sales',
      },
      plan: Plan.of('pro'),
      settings: {
        taxLabel: 'IVA',
        taxRateBp: 1600,
        baseCurrency: 'USD',
        exchangeRateScaled: null,
        exchangeRateAt: null,
      },
      isDemo: false,
    };

    const runtime = postgresRuntime({
      url: dbUrl,
      ctx,
      ids: { next: () => uuidv7() },
      clock: systemClock,
    });

    const useCases: UseCases = assembleUseCases(runtime, ctx);
    const op = data.operation as SyncOperationItem;
    const buildCommand = COMMAND_DESERIALIZERS[op.type];

    if (!buildCommand) {
      return;
    }

    const cmd = buildCommand(op);
    await useCases.posCommandBus.dispatch(cmd);
  },
});

async function shutdown(): Promise<void> {
  await worker.close();
  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown();
});

process.on('SIGINT', () => {
  void shutdown();
});
