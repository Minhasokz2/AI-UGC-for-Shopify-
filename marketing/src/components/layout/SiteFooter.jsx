export default function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <p>&copy; {year} MotionArt. AI product photography, UGC, and video for Shopify merchants.</p>
    </footer>
  );
}
