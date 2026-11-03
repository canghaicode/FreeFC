UPDATE activities SET settled = true
WHERE id IN (
  '6453c75a-f90e-4582-9e81-3648774e573b',
  'f930f90d-16a4-45fb-8da5-8879c343e9ce',
  'ced9ba95-678a-4e5d-af2f-97b1f2ff02d9'
)
AND settled = false AND cancelled = false;