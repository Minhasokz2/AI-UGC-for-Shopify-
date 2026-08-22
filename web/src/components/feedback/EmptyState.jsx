import { EmptyState as PolarisEmptyState } from '@shopify/polaris';

export function EmptyState({ heading, children, action }) {
  return (
    <PolarisEmptyState heading={heading} action={action}>
      {children}
    </PolarisEmptyState>
  );
}
