UPDATE activities SET settled = true
WHERE id IN (
  '2c8b169a-ce13-4493-91b5-98bcdcd62096',
  'b824ebc1-ec7f-4516-8b64-4c7ea5717c29',
  'ccf56337-0b29-4c07-8748-19a7702863af'
)
AND settled = false AND cancelled = false;