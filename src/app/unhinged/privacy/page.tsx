import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Unhinged — Privacy Policy",
  description: "How Unhinged handles selected screenshots, local analysis, storage, deletion and support requests.",
  alternates: { canonical: "https://abishekg.com/unhinged/privacy" },
  openGraph: { title: "Unhinged — Privacy Policy", description: "Privacy information for Unhinged.", url: "https://abishekg.com/unhinged/privacy", type: "website" },
};

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p><strong>Unhinged · Effective October 28, 2026</strong></p>
      <p>Unhinged is an on-device entertainment app developed by Abishek Gopal. For privacy questions, email <a href="mailto:me@abishekg.com">me@abishekg.com</a>. This policy covers the current Unhinged app and these support and privacy pages.</p>
      <h2>Selected screenshots stay on your device</h2>
      <p>The system photo picker gives Unhinged only the images you choose. The app does not request your entire photo library, take screenshots of other apps, read your installed-app list, or change your original Photos assets.</p>
      <p>Unhinged creates app-owned, normalized image copies to prepare and render scenes locally. Screenshots may contain personal information, so choose what you are comfortable displaying. The app does not upload your images, crops or scene contents to the developer or an AI service.</p>
      <h2>On-device image analysis</h2>
      <p>Apple Vision processes selected screenshots locally to estimate likely app-icon positions. This can include transient text recognition and shape/layout analysis. Only normalized icon rectangles and image dimensions are cached with the app-owned image. Recognized text, app names and an installed-app inventory are not saved or sent to the developer.</p>
      <p>During damaged playback, repeated taps on likely icon positions may reveal a simulation reminder. Touch and gesture state is used locally for playback and temporary reactions; it is not sent as analytics or retained as a touch history.</p>
      <h2>Other local information</h2>
      <p>The app stores scene names and ordering, image references and crops, preferences, completed fold or shake progress, effect settings and the notice-acceptance preference. A name saved by an earlier version may also remain locally until reset.</p>
      <p>On Duo, public hinge information drives folding effects and optional opening audio. On other iPhones, completed system shake events drive the effect. The app does not record raw motion histories, microphone input or camera video. The Duo idle-display timeout is a local visual effect and does not record your activity.</p>
      <h2>No app tracking, advertising or account</h2>
      <p>The current app has no advertising, app analytics, account service, tracking identifiers or third-party analytics SDKs. It does not send screenshots or locally stored scene/effect data off the device. Apple may separately process App Store transactions, diagnostics or device backups under your Apple settings and Apple&apos;s policies; those services are not operated by Unhinged.</p>
      <h2>Retention and deletion</h2>
      <p>App-owned data remains on the device until you change or remove it. Removing a scene deletes image copies and derived icon caches that no remaining scene uses. <strong>Advanced Settings → Reset all app data</strong> deletes app-owned scenes, image copies, derived caches, preferences and effect progress. It does not delete originals in Photos.</p>
      <p>Device or cloud backups may include app data according to your settings. Resetting the app does not erase existing backups; manage those through your device or backup provider. There is no Unhinged account to delete and no developer-held copy of your scenes to retrieve or erase.</p>
      <h2>Capture protection</h2>
      <p>While damage is visible, the app uses iOS capture protection for the playback image and fault layers. Screenshots and recordings can appear black while the effect stays visible on the phone. Setup and clean playback remain capturable. This does not delete or modify existing images, and it does not guarantee prevention of every capture method.</p>
      <h2>Support email</h2>
      <p>If you email support, the developer receives your email address and the message and attachments you choose to send. They are used to answer your request and investigate the reported issue, not for advertising or app tracking. Your and the developer&apos;s email providers process the message as part of email delivery.</p>
      <p>Support correspondence may be kept while resolving an issue and for relevant follow-up. You can request deletion by emailing <a href="mailto:me@abishekg.com">me@abishekg.com</a>; necessary legal or security records may be retained. Please avoid sending sensitive information or unredacted screenshots.</p>
      <h2>This website</h2>
      <p>These pages are hosted on Vercel. Visiting them sends the hosting provider normal web-request information such as your IP address, browser information and the requested page, which may be processed in hosting and security logs under <a href="https://vercel.com/legal/privacy-policy">Vercel&apos;s privacy policy</a>. The developer does not set a separate retention period for provider-controlled hosting logs.</p>
      <p>These pages add no advertising, analytics, tracking pixels, forms or screenshot-upload service. The existing website theme control saves a light/dark preference in your browser&apos;s local storage. You can remove it by clearing this site&apos;s browser data. Opening an email link uses your chosen email app.</p>
      <h2>Changes and contact</h2>
      <p>If the app&apos;s data practices change, this policy will be updated with a new effective date. Questions about this policy, support correspondence or deletion can be sent to Abishek Gopal at <a href="mailto:me@abishekg.com">me@abishekg.com</a>.</p>
      <p><Link href="/unhinged/support">Return to Unhinged support</Link></p>
    </>
  );
}
