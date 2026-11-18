import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let failureMode = 'missing';
await mock.module('./sqlConnection.js', {
  namedExports: {
    getConnectionConfig: () => ({
      config: { authMode: 'sql' },
      missing: failureMode === 'missing' ? ['TEST_DATABASE'] : []
    }),
    getPool: async () => { throw new Error('Live database unavailable'); },
    formatSqlIdentifier: (name) => name
  }
});

const { readCustomerEscapesData } = await import('./customerEscapesRepository.js');
const { readControllableCostsData } = await import('./controllableCostsRepository.js');
const { readLaborUtilizationData } = await import('./laborUtilizationRepository.js');

test('SQL cards surface missing configuration and live database failures', async () => {
  const readers = [
    readCustomerEscapesData,
    readControllableCostsData,
    readLaborUtilizationData
  ];

  failureMode = 'missing';
  for (const read of readers) {
    await assert.rejects(read(), /TEST_DATABASE/);
  }

  failureMode = 'database';
  for (const read of readers) {
    await assert.rejects(read(), /Live database unavailable/);
  }
});
