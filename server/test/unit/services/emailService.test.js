const { sendEmail } = require('../../../src/services/emailService');
const { ProviderApiError } = require('../../../src/errors/AppError');
const { env } = require('../../../src/config/env');

describe('services/emailService', () => {
  it('sends with the configured from address and returns the message id', async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: 'msg_123' }, error: null });
    const client = { emails: { send } };

    const result = await sendEmail({ to: 'merchant@example.com', subject: 'Hi', html: '<p>hi</p>' }, { client });

    expect(send).toHaveBeenCalledWith({
      from: env.RESEND_FROM_EMAIL,
      to: 'merchant@example.com',
      subject: 'Hi',
      html: '<p>hi</p>',
    });
    expect(result).toEqual({ id: 'msg_123' });
  });

  it('throws ProviderApiError when Resend reports an error without throwing (its {data,error} shape)', async () => {
    const send = vi.fn().mockResolvedValue({ data: null, error: { message: 'invalid from address' } });
    const client = { emails: { send } };

    await expect(sendEmail({ to: 'x@example.com', subject: 's', html: 'h' }, { client })).rejects.toBeInstanceOf(
      ProviderApiError,
    );
  });
});
