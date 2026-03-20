export const DUMMY_TABLE_NAME = 'dummy_table_name';

const dummyTableRows = [
  {
    payment_type: 'Subscription',
    payment_summary_type: 'Streaming Plan',
    expected_cash_amt: 19.99,
    ANNUAL_AMT: 239.88,
    CHARGE_AMT_Basis: 'per Month',
    START_DATE: '2026-01-01T00:00:00.000Z',
    END_DATE: '2026-12-31T23:59:59.999Z'
  },
  {
    payment_type: 'Insurance',
    payment_summary_type: 'Business Liability',
    expected_cash_amt: 1450,
    ANNUAL_AMT: 1450,
    CHARGE_AMT_Basis: 'per Annual',
    START_DATE: '2026-03-15T00:00:00.000Z',
    END_DATE: '2026-12-31T23:59:59.999Z'
  },
  {
    payment_type: 'Software License',
    payment_summary_type: 'Reporting Suite',
    expected_cash_amt: 299.5,
    ANNUAL_AMT: 1198,
    CHARGE_AMT_Basis: 'per Quarter',
    START_DATE: '2026-07-01T00:00:00.000Z',
    END_DATE: '2026-09-30T23:59:59.999Z'
  },
  {
    payment_type: 'Facilities',
    payment_summary_type: 'Office Lease',
    expected_cash_amt: 420,
    ANNUAL_AMT: 5040,
    CHARGE_AMT_Basis: 'per Month',
    START_DATE: '2026-10-01T00:00:00.000Z',
    END_DATE: '2027-09-30T23:59:59.999Z'
  },
  {
    payment_type: 'Support',
    payment_summary_type: 'Managed Services',
    expected_cash_amt: 600,
    ANNUAL_AMT: 2400,
    CHARGE_AMT_Basis: 'per Quarter',
    START_DATE: '2027-01-01T00:00:00.000Z',
    END_DATE: '2027-12-31T23:59:59.999Z'
  }
];

export function getDummyTableRows() {
  return dummyTableRows.map((row) => ({ ...row }));
}
