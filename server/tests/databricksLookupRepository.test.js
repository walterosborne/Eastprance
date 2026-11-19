import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let elementRows = [];
let categoryRows = [];
const queries = [];
await mock.module('../databricksQuery.js', {
  namedExports: {
    executeDatabricksQuery: async ({ tableName, query }) => {
      queries.push({ tableName, query });
      return tableName.endsWith('.cost_element_key') ? elementRows : categoryRows;
    }
  }
});

const { readCostClassificationRows } = await import('../databricksLookupRepository.js');

test('cost classifications read existing trailing-space headers without SQL errors', async () => {
  elementRows = [
    { 'Cost Category ': ' Facilities ', 'Cost Element': ' 4300591 ',
      'Cost Element Description': ' Rent ', Controllable: ' Controllable ', last_updated: '2026-11-17' },
    { 'Cost Category ': 'Empty', 'Cost Element': ' ',
      'Cost Element Description': '', Controllable: '' }
  ];
  categoryRows = [{ 'Cost Category  ': ' Facilities ', Controllable: 'Controllable' }];
  const result = await readCostClassificationRows();
  assert.deepEqual(result, {
    elementRows: [{ cost_category: 'Facilities', cost_element: '4300591',
      cost_element_description: 'Rent', controllable: 'Controllable' }],
    categoryRows: [{ cost_category: 'Facilities', controllable: 'Controllable' }]
  });
  assert.equal(queries.length, 2);
  assert.ok(queries.every(({ query }) => query.startsWith('SELECT * FROM ')));
});

test('canonical headers work and ambiguous headers fail explicitly', async () => {
  elementRows = [{ 'Cost Category': 'A', 'Cost Element': '41',
    'Cost Element Description': 'Other', Controllable: 'Yes' }];
  categoryRows = [{ 'Cost Category': 'A', Controllable: 'Yes' }];
  assert.equal((await readCostClassificationRows()).elementRows[0].cost_category, 'A');
  elementRows = [{ ...elementRows[0], 'Cost Category ': 'B' }];
  await assert.rejects(readCostClassificationRows(), /exactly one Cost Category column; found 2/);
});
