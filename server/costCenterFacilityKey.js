// Normalize cost centers before matching live SQL and Databricks data.
export function normalizeCostCenter(value) {
  return String(value ?? '').trim().toUpperCase();
}
