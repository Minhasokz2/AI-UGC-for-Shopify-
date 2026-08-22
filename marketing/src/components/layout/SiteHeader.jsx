import { Link } from 'react-router-dom';

export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link to="/" className="site-header__brand">
          MotionArt
        </Link>
        <nav className="site-header__nav">
          <Link to="/pricing">Pricing</Link>
          <Link to="/install" className="btn">
            Install app
          </Link>
        </nav>
      </div>
    </header>
  );
}
