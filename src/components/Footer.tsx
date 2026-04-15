export default function Footer() {
  return (
    <footer className="px-6 md:px-12 lg:px-24 max-w-5xl mx-auto w-full py-10 border-t border-card-border">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-muted">
        <p>&copy; {new Date().getFullYear()} Abishek Gopal</p>
        <div className="flex gap-6">
          <a
            href="mailto:me@abishekg.com"
            className="hover:text-foreground transition-colors"
          >
            Email
          </a>
          <a
            href="https://linkedin.com/in/abishekg"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            LinkedIn
          </a>
          <a
            href="tel:+14154819889"
            className="hover:text-foreground transition-colors"
          >
            Phone
          </a>
        </div>
      </div>
    </footer>
  );
}
