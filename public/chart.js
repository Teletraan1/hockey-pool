export function differenceFromLeader(series) {
  const pointCount = Math.max(
    0,
    ...series.map((item) => item.points?.length ?? 0)
  );
  const leaderTotals = Array.from({ length: pointCount }, (_, index) =>
    Math.max(
      0,
      ...series.map((item) => Number(item.points?.[index]?.value ?? 0))
    )
  );

  return series.map((item) => ({
    ...item,
    points: item.points.map((point, index) => ({
      ...point,
      value: Number(point.value ?? 0) - leaderTotals[index]
    }))
  }));
}
