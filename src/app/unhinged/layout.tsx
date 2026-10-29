import Link from "next/link";
import styles from "./unhinged.module.css";

export default function UnhingedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.site}>
      <header className={styles.header}>
        <Link href="/unhinged/support" className={styles.brand}>Unhinged<span>Support & privacy</span></Link>
        <nav aria-label="Unhinged"><Link href="/unhinged/support">Support</Link><Link href="/unhinged/privacy">Privacy</Link></nav>
      </header>
      <main className={styles.content}>{children}</main>
      <footer className={styles.footer}>
        <p>Unhinged by Abishek Gopal · <a href="mailto:me@abishekg.com">me@abishekg.com</a></p>
        <p><Link href="/">abishekg.com</Link> · <Link href="/unhinged/support">Support</Link> · <Link href="/unhinged/privacy">Privacy Policy</Link></p>
        <p>Independent entertainment app. No Apple affiliation or endorsement.</p>
      </footer>
    </div>
  );
}
