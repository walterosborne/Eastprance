const DEFAULT_GOAL_LABEL = 'Goal';

const METRIC_GOALS = {
  controllableCosts: {
    quarterly: 1500000,
    yearly: 6000000,
    pareto: 900000
  },
  sif: {
    monthly: 1,
    quarterly: 3,
    yearly: 12
  },
  potentialSif: {
    monthly: 4,
    quarterly: 12,
    yearly: 48
  },
  nmfr: {
    monthly: 4.5,
    quarterly: 4.5,
    yearly: 4.5
  },
  otd: {
    monthly: 280000,
    quarterly: 840000,
    yearly: 3360000,
    pareto: 300000
  },
  labor: {
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
