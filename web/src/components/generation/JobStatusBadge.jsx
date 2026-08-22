import { Badge } from '@shopify/polaris';

const TONE_BY_STATUS = {
  pending: 'info',
  processing: 'attention',
  succeeded: 'success',
  failed: 'critical',
  cancelled: 'warning',
};

export function JobStatusBadge({ status }) {
  return <Badge tone={TONE_BY_STATUS[status] ?? 'info'}>{status}</Badge>;
}
