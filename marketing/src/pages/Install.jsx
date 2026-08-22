// TODO(placeholder): MotionArt does not yet have a real Shopify App Store
// listing. This URL is a NOT-YET-LIVE placeholder and must be replaced with
// the real listing URL once the app is published to the Shopify App Store.
const APP_STORE_URL = 'https://apps.shopify.com/motionart';

export default function Install() {
  return (
    <div className="install-page">
      <h1>Install MotionArt</h1>
      <p>
        MotionArt is installed directly from the Shopify App Store, just like any other Shopify
        app. Click below to find the MotionArt listing and start your install.
      </p>
      <p>
        <a href={APP_STORE_URL} className="btn">
          Go to the Shopify App Store
        </a>
      </p>
      <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem' }}>
        Note: our App Store listing is not live yet. This link is a placeholder until MotionArt
        is published — check back soon.
      </p>
    </div>
  );
}
