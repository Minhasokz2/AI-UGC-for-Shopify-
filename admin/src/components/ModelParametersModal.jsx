import { Modal, DescriptionList, Badge } from '@shopify/polaris';

/**
 * Read-only "View parameters" drawer for one model — every field the
 * backend returns, per the build brief ("render every field ... only
 * creditCost and needsPriceReview are realistically things an operator
 * edits day-to-day ... still show them, e.g. in a 'View parameters'
 * read-only section").
 */
function ModelParametersModal({ model, onClose }) {
  if (!model) return null;

  const constraint = model.imageCountConstraint || {};

  const items = [
    { term: 'id', description: model.id },
    { term: 'label', description: model.label },
    { term: 'category', description: model.category },
    { term: 'role', description: model.role },
    { term: 'provider', description: model.provider },
    { term: 'endpoint', description: model.endpoint },
    { term: 'inputShape', description: model.inputShape },
    { term: 'imageParam', description: model.imageParam },
    { term: 'outputField', description: model.outputField },
    { term: 'supportsBatch', description: model.supportsBatch ? 'true' : 'false' },
    { term: 'creditCost', description: String(model.creditCost) },
    { term: 'actualCostUsd', description: `$${Number(model.actualCostUsd).toFixed(4)}` },
    {
      term: 'needsPriceReview',
      description: (
        <Badge tone={model.needsPriceReview ? 'warning' : 'success'}>
          {model.needsPriceReview ? 'Needs review' : 'Reviewed'}
        </Badge>
      ),
    },
    { term: 'imageCountConstraint', description: `min ${constraint.min ?? '—'} / max ${constraint.max ?? '—'}` },
  ];

  return (
    <Modal open onClose={onClose} title={`Parameters: ${model.label}`} large>
      <Modal.Section>
        <DescriptionList items={items} />
      </Modal.Section>
    </Modal>
  );
}

export default ModelParametersModal;
