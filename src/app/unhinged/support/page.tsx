import type { Metadata } from "next";
import Link from "next/link";
import styles from "../unhinged.module.css";

export const metadata: Metadata = {
  title: "Unhinged — Support",
  description: "Help with Unhinged screenshot scenes, display effects, return gestures and local data.",
  alternates: { canonical: "https://abishekg.com/unhinged/support" },
  openGraph: { title: "Unhinged — Support", description: "Support for the Unhinged entertainment app.", url: "https://abishekg.com/unhinged/support", type: "website" },
};

export default function SupportPage() {
  return (
    <>
      <h1>Unhinged support</h1>
      <p>Turn your own screenshots into an interactive display-glitch scene. Unhinged is an entertainment simulation: it does not damage, diagnose or repair your phone.</p>
      <div className={styles.notice}>
        <strong>Need to return to the controls?</strong>
        <p>On an ordinary iPhone, hold a stationary point on the playback screen for <strong>five seconds</strong>. On iPhone Duo, <strong>close the display, then triple-tap the outer screen</strong>. VoiceOver also offers a Return to landing page action.</p>
      </div>
      <h2>Contact the developer</h2>
      <p>Email <a href="mailto:me@abishekg.com">me@abishekg.com</a> for support or privacy questions. Unhinged is developed by Abishek Gopal.</p>
      <p>Include your app version, iPhone model, iOS version and the steps that led to the issue. Please remove personal information from any screenshots you choose to send. No screenshot upload is required to ask for help.</p>
      <h2>Create a scene</h2>
      <ol>
        <li>Select <strong>Change scene</strong> on landing to open Scenes. Create a scene and choose screenshots with the system photo picker. You can also use the original sample artwork to try the app without personal images.</li>
        <li>On ordinary iPhones, add a portrait <strong>Lock Screen</strong> and <strong>Home Screen</strong>. Page 2 and App Library are optional.</li>
        <li>On Duo, add an <strong>outer Home</strong> screenshot and <strong>inner Home screenshots in both landscape and portrait</strong>. Outer Lock is optional. Inner Lock is optional too; adding either inner Lock orientation makes its matching orientation required. Additional Home pages and App Library are optional.</li>
        <li>Adjust each image under Scenes if needed and wait for preparation to finish. Missing or incorrectly oriented required captures must be corrected before playback can start.</li>
        <li>Return to landing, choose Minimal, Medium, Extreme or Ultra, set the reveal count, then start. You can save multiple scenes.</li>
      </ol>
      <h2>Reveal and explore the effect</h2>
      <p>Duo counts completed close-and-open folds and shows damage only on its inner display. Other iPhones count completed gentle shakes during playback. Duo does not use shakes to trigger damage. Advanced Settings offers a visible simulate-and-start control so you can try the effect without physical motion.</p>
      <p>Swipe up from your Lock image to reveal Home. Swipe between uploaded Home pages and App Library. These are still images inside Unhinged: pictured apps, widgets and notifications are not live, and swiping does not unlock the actual device.</p>
      <p>Repeated taps on likely app icons while damage is visible can show a simulation reminder. Keep playing dismisses it; repeated icon taps can show it again.</p>
      <h2>Gradual damage and customization</h2>
      <p>Build damage gradually is available above Minimal. After the first defect, further completed folds on Duo, or completed shakes on other iPhones, advance stock damage toward your selected level. Custom damage in Advanced Settings overrides the stock expression and offers temporary touch reactions and adjustable effects.</p>
      <h2>Why did the Duo screen go dark?</h2>
      <p>During damaged inner playback, no touch input for the configured timeout fades the screenshot to black while the glitch stays visible. The default is five seconds. Change it in <strong>Advanced Settings → Idle display → Screen timeout</strong>. Tap to wake the Home image with the same damage. This is an in-app effect, not the device locking.</p>
      <h2>Why are screenshots or recordings black?</h2>
      <p>While damage is visible, playback uses iOS capture protection for its image and fault layers. Captures can appear black even though the effect remains visible on the phone. Setup and clean playback remain capturable. Capture protection does not change or delete your Photos images, and is not a guarantee against every capture method.</p>
      <h2>Reduce motion, brightness or sound</h2>
      <p>Enable Static effects in Advanced Settings to keep damage static. Supported Reduce Motion and Dim Flashing Lights settings also suppress animated reactions. Custom light pulses are off by default and require confirmation. If you are sensitive to bright lines or light changes, avoid these effects. Duo hinge-crunch audio can be disabled; it follows opening motion and honors device volume and Silent Mode.</p>
      <h2>Delete data or fix an import</h2>
      <p>All selected images are copied into the app; originals in Photos stay unchanged. Use Scenes to replace a capture or remove a scene. <strong>Advanced Settings → Reset all app data</strong> removes app-owned scenes, cached icon positions, preferences and progress. Existing device backups are managed separately.</p>
      <p>If an image cannot open, try a valid screenshot under 50 MB. A project holds up to 12 scenes. If saved data cannot be loaded, use Retry before resetting, or contact support.</p>
      <p>Read the <Link href="/unhinged/privacy">Privacy Policy</Link> for details about on-device image analysis, storage, deletion, support email and this website.</p>
      <p><small>Updated October 28, 2026. Requires iOS 27.1 or later in the current build. Device-specific behavior depends on supported hardware and iOS.</small></p>
    </>
  );
}
