const DEFAULT_GOAL_LABEL = 'Goal';

const METRIC_GOALS = {
  controllableCosts: {
    quarterly: 1500000,
    yearly: 6000000,
    pareto: 900000
  },
  controllableCostsHana: {
    monthly: 500000,
    quarterly: 1500000,
    yearly: 6000000,
    pareto: 900000
  },
  sif: {
    default: 0,
    monthly: 0,
    quarterly: 0,
    yearly: 0
  },
  potentialSif: {
    monthly: 0,
    quarterly: 2,
    yearly: 4
  },
  nmfr: {
    monthly: 4.5,
    quarterly: 4.5,
    yearly: 4.5
  },
  otd: {
    monthly: .95,
    quarterly: .95,
    yearly: .95,
    pareto: .95
  },
  labor: {
    monthly: 0.65,
    quarterly: 0.65,
    yearly: 0.65
  },
  laborHana: {
    monthly: 0.65,
    quarterly: 0.65,
    yearly: 0.65
  }
};

export function getMetricGoalLine(metricKey, goalKey) {
  const metricGoal = METRIC_GOALS[metricKey];

  if (!metricGoal) {
    return null;
  }

  const value =
    metricGoal[goalKey] ??
    metricGoal.default ??
    null;

  if (value === null || value === undefined) {
    return null;
  }

  return {
    label: DEFAULT_GOAL_LABEL,
    value
  };
}

export { METRIC_GOALS, DEFAULT_GOAL_LABEL };
