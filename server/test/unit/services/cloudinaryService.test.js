const { uploadImage, deleteImage } = require('../../../src/services/cloudinaryService');

describe('services/cloudinaryService', () => {
  describe('uploadImage', () => {
    it('calls client.uploader.upload and normalizes the result to {url, publicId}', async () => {
      const upload = vi.fn().mockResolvedValue({ secure_url: 'https://res.cloudinary.com/x/a.png', public_id: 'motionart/a' });
      const client = { uploader: { upload, destroy: vi.fn() } };

      const result = await uploadImage('data:image/png;base64,AAAA', { client });

      expect(upload).toHaveBeenCalledWith('data:image/png;base64,AAAA');
      expect(result).toEqual({ url: 'https://res.cloudinary.com/x/a.png', publicId: 'motionart/a' });
    });
  });

  describe('deleteImage', () => {
    it('calls client.uploader.destroy with the given publicId', async () => {
      const destroy = vi.fn().mockResolvedValue({ result: 'ok' });
      const client = { uploader: { upload: vi.fn(), destroy } };

      await deleteImage('motionart/a', { client });

      expect(destroy).toHaveBeenCalledWith('motionart/a');
    });
  });
});
