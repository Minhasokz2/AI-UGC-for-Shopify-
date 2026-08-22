const { createAttachShopContext } = require('../../../src/middleware/auth');
const { UnauthorizedError } = require('../../../src/errors/AppError');

describe('middleware/auth', () => {
  describe('createAttachShopContext', () => {
    it('reads shopDomain from res.locals.shopify.session.shop, attaches req.shopDomain/req.shop, and calls next() with no error', async () => {
      const shopsRepo = { getOrCreateShop: vi.fn().mockResolvedValue({ id: 'shop-a.myshopify.com', creditBalance: 10 }) };
      const middleware = createAttachShopContext({ shopsRepo });
      const req = {};
      const res = { locals: { shopify: { session: { shop: 'shop-a.myshopify.com' } } } };
      const next = vi.fn();

      middleware(req, res, next);
      await Promise.resolve();
      await Promise.resolve();

      expect(shopsRepo.getOrCreateShop).toHaveBeenCalledWith('shop-a.myshopify.com');
      expect(req.shopDomain).toBe('shop-a.myshopify.com');
      expect(req.shop).toEqual({ id: 'shop-a.myshopify.com', creditBalance: 10 });
      expect(next).toHaveBeenCalledWith();
    });

    it('calls next(UnauthorizedError) when there is no session on res.locals.shopify', () => {
      const shopsRepo = { getOrCreateShop: vi.fn() };
      const middleware = createAttachShopContext({ shopsRepo });
      const next = vi.fn();

      middleware({}, { locals: {} }, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
      expect(shopsRepo.getOrCreateShop).not.toHaveBeenCalled();
    });

    it('forwards a shopsRepo failure to next(err)', async () => {
      const err = new Error('firestore down');
      const shopsRepo = { getOrCreateShop: vi.fn().mockRejectedValue(err) };
      const middleware = createAttachShopContext({ shopsRepo });
      const next = vi.fn();

      middleware({}, { locals: { shopify: { session: { shop: 'shop-a' } } } }, next);
      await Promise.resolve();
      await Promise.resolve();

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
