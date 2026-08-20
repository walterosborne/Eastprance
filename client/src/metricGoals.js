const DEFAULT_GOAL_LABEL = 'Goal';

const METRIC_GOALS = {
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
