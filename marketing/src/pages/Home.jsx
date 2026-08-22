import { Link } from 'react-router-dom';

const STEPS = [
  {
    title: 'Pick a product',
    body: 'Connect your Shopify catalog and choose the product you want new imagery or video for.',
  },
  {
    title: 'Generate',
    body: 'MotionArt generates studio-quality product photos, UGC-style lifestyle shots, or short videos with AI.',
  },
  {
    title: 'Publish back to your store',
    body: 'Review the results and push them straight to your product listings — no extra tools needed.',
  },
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <h1>AI product photography, straight from your catalog</h1>
        <p>
          MotionArt turns the products you already sell into studio-quality photos, UGC-style
          lifestyle images, and short product videos — no photoshoot required.
        </p>
        <Link to="/install" className="btn">
          Install MotionArt
        </Link>
      </section>

      <section className="how-it-works">
        <div className="container">
          <h2 style={{ textAlign: 'center' }}>How it works</h2>
          <div className="how-it-works__steps">
            {STEPS.map((step, index) => (
              <div className="step" key={step.title}>
                <div className="step__number">{index + 1}</div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-banner">
        <h2>Ready to see your products in a new light?</h2>
        <Link to="/install" className="btn">
          Install MotionArt
        </Link>
      </section>
    </>
  );
}
