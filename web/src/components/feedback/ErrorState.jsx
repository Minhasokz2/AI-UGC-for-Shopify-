import { Banner, Text } from '@shopify/polaris';
import { getToastMessageForError } from '../../lib/apiClient.js';

export function ErrorState({ error, title = 'Something went wrong' }) {
  return (
    <Banner title={title} tone="critical">
      <Text as="p">{getToastMessageForError(error)}</Text>
    </Banner>
  );
}
