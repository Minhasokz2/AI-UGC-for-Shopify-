import { DataTable, Badge, Text, BlockStack } from '@shopify/polaris';

function formatCents(cents) {
  if (!Number.isFinite(cents)) return '—';
  return `${cents.toFixed(3)}¢`;
}

function formatMargin(marginPct) {
  if (marginPct === Infinity) return '+∞%';
  if (marginPct === -Infinity) return '-∞%';
  if (!Number.isFinite(marginPct)) return '—';
  return `${marginPct.toFixed(1)}%`;
}

/**
 * Renders one computeMarginRange() result as a table, one row per pack —
 * shared by the standalone /margin-calculator page and the inline
 * live-preview in ModelEditor, so the two never drift in presentation.
 */
function MarginTable({ entries, worstCase }) {
  const rows = entries.map((entry) => [
    entry.label,
    entry.period,
    formatCents(entry.revenuePerCreditCents),
    formatMargin(entry.marginPct),
    <Badge key={`${entry.packId}-${entry.period}`} tone={entry.tone}>
      {entry.tone === 'critical' ? 'Losing money' : entry.tone === 'warning' ? 'Thin margin' : 'Healthy'}
    </Badge>,
  ]);

  return (
    <BlockStack gap="200">
      <DataTable
        columnContentTypes={['text', 'text', 'numeric', 'numeric', 'text']}
        headings={['Pack', 'Period', 'Revenue/credit', 'Margin', 'Status']}
        rows={rows}
      />
      {worstCase ? (
        <Text as="p" tone={worstCase.tone === 'critical' ? 'critical' : 'subdued'}>
          Worst-case margin: <strong>{formatMargin(worstCase.marginPct)}</strong> at {worstCase.label} (
          {worstCase.period})
        </Text>
      ) : null}
    </BlockStack>
  );
}

export default MarginTable;
