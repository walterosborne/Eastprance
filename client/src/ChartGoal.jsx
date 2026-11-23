import { ChartsReferenceLine } from '@mui/x-charts';

const percentFormatter = new Intl.NumberFormat('en-US', { style: 'percent' });
export const percentGoalAxis = {
  id: 'goal-percent', position: 'right', min: 0, max: 1, width: 48,
  valueFormatter: value => percentFormatter.format(value), tickLabelStyle: { fontSize: 11 }
};

// Let the chart library supply the actual series extents, including stacked bars.
// Keep the existing bounds and leave room for the label when a goal lands on an edge.
export function axisIncludingGoal(axis, goal) {
  if (!Number.isFinite(goal?.value)) return axis;
  const { min, max, ...options } = axis;
  return {
    ...options,
    domainLimit(dataMin, dataMax) {
      const lower = min ?? (Number.isFinite(dataMin) ? dataMin : goal.value);
      const upper = max ?? (Number.isFinite(dataMax) ? dataMax : goal.value);
      const span = Math.max(upper, goal.value) - Math.min(lower, goal.value);
      const inset = (span || Math.abs(goal.value) || 1) * 0.06;
      return { min: Math.min(lower, goal.value - inset), max: Math.max(upper, goal.value + inset) };
    }
  };
}

export function chartAxesWithGoal(axes, goal, usePercentAxis) {
  if (!Number.isFinite(goal?.value)) return axes;
  if (usePercentAxis) return [...axes, percentGoalAxis];
  return [axisIncludingGoal(axes[0], goal), ...axes.slice(1)];
}

export function ChartGoal({ goal, axisId }) {
  if (!Number.isFinite(goal?.value)) return null;
  return <ChartsReferenceLine
    axisId={axisId}
    y={goal.value}
    label={goal.label}
    labelAlign="end"
    lineStyle={{ stroke: 'var(--chart-goal)', strokeDasharray: '6 4', strokeWidth: 1.7 }}
    labelStyle={{ fill: 'var(--chart-goal)', fontSize: 11, fontWeight: 600,
      stroke: 'var(--surface)', strokeWidth: 3, paintOrder: 'stroke' }}
  />;
}

export function EmptyChartGoal({ goal }) {
  return Number.isFinite(goal?.value) ? <span className="empty-chart-goal">{goal.label}</span> : null;
}
