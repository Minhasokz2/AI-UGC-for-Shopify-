import { Page } from '@shopify/polaris';

export function PageSkeleton({ title, subtitle, backAction, primaryAction, children }) {
  return (
    <Page title={title} subtitle={subtitle} backAction={backAction} primaryAction={primaryAction}>
      {children}
    </Page>
  );
}
