// Lightweight read of the precomputed CWI + SDS facility-cost extract.
// Run server/sql/create_qmi_controllable_costs_new_extract.sql before deploying.
export const CONTROLLABLE_COSTS_NEW_DBM_QUERY = `
SELECT [year], [month], division, business_unit, facility,
       facility_city, facility_state, cost_center, cost_category,
       gl_account_cost_element, cost_element_description, cost
FROM [ecosystem_source].[qmi].[controllable_costs_new_extract]
WHERE [year] >= 2025
ORDER BY [year], [month], division, business_unit, facility,
         cost_center, cost_category, gl_account_cost_element;
`;
